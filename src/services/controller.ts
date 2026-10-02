import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { clipPlayer } from '@/audio/clipPlayer';
import { micPermission, startRecording, stopRecording } from '@/audio/recorder';
import { streamPlayer } from '@/audio/streamPlayer';
import { goLiveTone } from '@/audio/tone';
import { SERVER_URL } from '@/config';
import type { AppDispatch, RootState } from '@/store';
import { channelApi, setHeardBy, upsertMessages } from '@/store/api/channelApi';
import { netEvent, setMissedOnReturn, setNextRetry, setOnline } from '@/store/slices/connection';
import {
  setDenied,
  setHolding,
  setLevel,
  setMicDenied,
  setMyMode,
  setNotice,
  setSpeaker,
  startMine,
  stopMine,
} from '@/store/slices/floor';
import { clearQueue, enqueue, finished, markMissed, paused, progress, started, stopped } from '@/store/slices/playback';
import { advanceSeq, setServerOffset } from '@/store/slices/session';
import { rmsMulaw } from '@shared/mulaw';
import {
  CHUNK_MS,
  CHUNK_SAMPLES,
  MAX_CLIP_MS,
  MIN_CLIP_MS,
  decodeChunkFrame,
  encodeChunkFrame,
  type ChannelMessage,
  type ServerMsg,
} from '@shared/protocol';
import { audioCache, clipFiles } from './files';
import { createOutbox } from './outbox';
import { registry } from './registry';
import { createSocket } from './socket';

const GRANT_TIMEOUT_MS = 1000; // no answer to floor_request → record-and-send
const LIVE_SETTLE_MS = 1500; // give in-flight live chunks a moment before uploading
const NOTICE_MS = 5000;

interface Store {
  dispatch: AppDispatch;
  getState: () => RootState;
  subscribe(fn: () => void): () => void;
}

const buzz = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
const doubleBuzz = () => {
  buzz();
  setTimeout(buzz, 140);
};

/** How many chunks a committed clip has; used to tell "heard it all live". */
const chunksFor = (durationMs: number) => Math.ceil(Math.round((durationMs * 8000) / 1000) / CHUNK_SAMPLES);

export function createController(store: Store) {
  const { dispatch, getState } = store;
  const serverNow = () => Date.now() + getState().session.serverOffset;

  // ── talking state that does not belong in Redux (timers, counters) ──────
  let rec: {
    clipId: string;
    startPromise: Promise<boolean>;
    sentUpTo: number; // last chunk sent live
    recorded: number; // chunks written to disk
    grantTimer: ReturnType<typeof setTimeout> | null;
    maxTimer: ReturnType<typeof setTimeout> | null;
  } | null = null;
  let ackedLive = -1;
  let resumeAfter: { msgId: string; positionMs: number } | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  const notice = (text: string, ms = NOTICE_MS) => {
    dispatch(setNotice(text));
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => dispatch(setNotice(null)), ms);
  };

  // ── outbox ──────────────────────────────────────────────────────────────
  const outbox = createOutbox({
    dispatch,
    getState,
    onCommitted: (message) => onCommitted([message], false),
  });

  // ── socket ──────────────────────────────────────────────────────────────
  const socket = createSocket({
    hello: () => {
      const session = getState().session;
      return { t: 'hello', clientId: session.clientId, name: session.name ?? 'Unknown', lastSeq: session.lastSeq };
    },
    onLinkUp: () => dispatch(netEvent({ type: 'link_up', at: Date.now() })),
    onLinkDown: () => {
      dispatch(netEvent({ type: 'link_down', at: Date.now() }));
      // We can no longer hear the speaker or reach listeners.
      streamPlayer.end();
      dispatch(setSpeaker(null));
      if (getState().floor.my && getState().floor.my!.mode !== 'local') dispatch(setMyMode('local'));
    },
    onPong: (rtt, serverTime) => {
      dispatch(netEvent({ type: 'pong', at: Date.now(), rtt }));
      const offset = Math.round(serverTime - Date.now());
      if (Math.abs(offset - getState().session.serverOffset) > 250) dispatch(setServerOffset(offset));
    },
    onPingMissed: () => dispatch(netEvent({ type: 'ping_missed', at: Date.now() })),
    onRetryScheduled: (at) => dispatch(setNextRetry(at)),
    onMessage,
    onBinary,
  });

  function onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome': {
        dispatch(setOnline(msg.online));
        dispatch(setServerOffset(msg.serverTime - Date.now()));
        const mine = getState().session.clientId;
        dispatch(setSpeaker(msg.floor && msg.floor.clientId !== mine ? msg.floor : null));
        const firstJoin = getState().session.lastSeq === 0;
        const fresh = onCommitted(msg.missed, firstJoin);
        if (getState().connection.net === 'recovering') dispatch(setMissedOnReturn(fresh));
        outbox.kickNow();
        break;
      }
      case 'presence':
        dispatch(setOnline(msg.online));
        break;
      case 'floor_granted':
        if (rec && rec.clipId === msg.clipId && getState().floor.my?.mode !== 'local') goLive();
        break;
      case 'floor_denied':
        if (rec && rec.clipId === msg.clipId) {
          // Lost the race: nothing is recorded. Keep holding to go next.
          void discardRecording();
          dispatch(setDenied(msg.speaker));
          dispatch(setSpeaker(msg.speaker));
          streamPlayer.begin(msg.speaker.clipId);
          doubleBuzz();
        }
        break;
      case 'floor_taken': {
        dispatch(setSpeaker(msg.speaker));
        streamPlayer.begin(msg.speaker.clipId);
        interruptPlayback();
        break;
      }
      case 'floor_free': {
        const speaker = getState().floor.speaker;
        if (!speaker || speaker.clipId !== msg.clipId) break;
        streamPlayer.end();
        dispatch(setSpeaker(null));
        dispatch(setLevel(0));
        if (msg.reason !== 'released') {
          notice(`${speaker.name}'s signal dropped — the message will arrive in full`);
        }
        // Still holding after losing the race: you go live the moment they stop.
        if (getState().floor.holding && !rec) {
          dispatch(setDenied(null));
          void beginTalking(true);
        } else {
          resumePlayback();
        }
        break;
      }
      case 'chunk_ack':
        outbox.acked(msg.clipId, msg.upTo);
        if (rec?.clipId === msg.clipId) {
          ackedLive = Math.max(ackedLive, msg.upTo);
          reportBacklog();
        }
        break;
      case 'message':
        onCommitted([msg.message], false);
        break;
      case 'receipt':
        dispatch(setHeardBy(msg.msgId, msg.heardBy));
        break;
    }
  }

  function onBinary(data: Uint8Array) {
    const frame = decodeChunkFrame(data);
    const speaker = getState().floor.speaker;
    if (!frame || !speaker || speaker.clipId !== frame.clipId) return;
    if (rec && getState().floor.my?.mode === 'live') return; // half duplex
    streamPlayer.chunk(frame.clipId, frame.seq, frame.payload);
    dispatch(setLevel(Math.min(1, rmsMulaw(frame.payload) * 4)));
  }

  /**
   * New committed messages, from the socket, a catch-up, or my own upload.
   * Returns how many were missed (not heard live) — the "2 missed" count.
   */
  function onCommitted(list: ChannelMessage[], asHistory: boolean): number {
    if (list.length === 0) return 0;
    dispatch(upsertMessages(list));
    dispatch(advanceSeq(Math.max(...list.map((message) => message.seq))));
    const me = getState().session.clientId;
    const missed: string[] = [];
    for (const message of list) {
      if (message.senderId === me) {
        outbox.committed(message.id);
        continue;
      }
      if (streamPlayer.heardChunks(message.id) >= chunksFor(message.durationMs)) {
        socket.send({ t: 'played', msgId: message.id }); // heard it all live
      } else if (!asHistory && !getState().playback.missed.includes(message.id)) {
        missed.push(message.id);
      }
      streamPlayer.forget(message.id);
    }
    if (missed.length > 0) {
      dispatch(markMissed(missed));
      dispatch(enqueue(missed));
      playNext();
    }
    return missed.length;
  }

  // ── talking ─────────────────────────────────────────────────────────────
  function sendLive(seq: number, bytes: Uint8Array) {
    if (!rec) return;
    if (socket.sendBinary(encodeChunkFrame(rec.clipId, seq, bytes))) rec.sentUpTo = seq;
    reportBacklog();
  }

  function reportBacklog() {
    if (!rec) return;
    const ms = Math.max(0, rec.sentUpTo - ackedLive) * CHUNK_MS;
    dispatch(netEvent({ type: 'backlog', at: Date.now(), ms }));
  }

  function goLive() {
    if (!rec) return;
    if (rec.grantTimer) clearTimeout(rec.grantTimer);
    rec.grantTimer = null;
    dispatch(setMyMode('live'));
    buzz();
    goLiveTone();
    // Send what was recorded while the floor request was in flight.
    for (let seq = rec.sentUpTo + 1; seq < rec.recorded; seq++) {
      const bytes = clipFiles.readChunk(rec.clipId, seq);
      if (bytes) sendLive(seq, bytes);
    }
  }

  async function beginTalking(afterWait = false) {
    if (getState().floor.micDenied) return;
    interruptPlayback();
    const clipId = randomUUID();
    const recordedAt = serverNow();
    const net = getState().connection;
    const canStream = socket.isUp && (net.net === 'online' || net.net === 'recovering');
    const mode = canStream ? 'pending' : 'local';
    dispatch(startMine({ clipId, startedAt: Date.now(), mode }));
    outbox.begin(clipId, recordedAt);
    ackedLive = -1;
    const recording: NonNullable<typeof rec> = {
      clipId,
      startPromise: Promise.resolve(false),
      sentUpTo: -1,
      recorded: 0,
      grantTimer: null,
      maxTimer: setTimeout(() => {
        // Hard cap: stop with a buzz even if the finger is still down.
        buzz();
        void endTalking();
      }, MAX_CLIP_MS),
    };
    rec = recording;
    streamPlayer.setMuted(true);
    recording.startPromise = startRecording({
      onChunk: (seq, bytes) => {
        clipFiles.writeChunk(clipId, seq, bytes); // disk first, then the wire
        if (rec !== recording) return;
        recording.recorded = seq + 1;
        if (getState().floor.my?.mode === 'live') sendLive(seq, bytes);
      },
      onLevel: (level) => dispatch(setLevel(level)),
    });
    if (canStream) {
      socket.send({ t: 'floor_request', clipId, recordedAt });
      recording.grantTimer = setTimeout(() => {
        if (rec === recording && getState().floor.my?.mode === 'pending') dispatch(setMyMode('local'));
      }, GRANT_TIMEOUT_MS);
    } else {
      buzz();
    }
    if (afterWait && !canStream) goLiveTone();
    const ok = await recording.startPromise;
    if (!ok && rec === recording) {
      await discardRecording();
      notice('Could not open the microphone');
    }
  }

  async function finishRecording() {
    const recording = rec;
    if (!recording) return null;
    rec = null;
    if (recording.grantTimer) clearTimeout(recording.grantTimer);
    if (recording.maxTimer) clearTimeout(recording.maxTimer);
    await recording.startPromise;
    const result = await stopRecording();
    streamPlayer.setMuted(false);
    dispatch(netEvent({ type: 'backlog', at: Date.now(), ms: 0 }));
    return { recording, ...result };
  }

  async function discardRecording() {
    const mode = getState().floor.my?.mode;
    const res = await finishRecording();
    dispatch(stopMine());
    if (!res) return;
    if (mode === 'live' || mode === 'pending') {
      socket.send({ t: 'floor_release', clipId: res.recording.clipId, total: 0, durationMs: 0, recordedAt: 0 });
    }
    outbox.discard(res.recording.clipId);
  }

  async function endTalking() {
    const my = getState().floor.my;
    if (!rec || !my) return;
    const res = await finishRecording();
    dispatch(stopMine());
    if (!res) return;
    const { recording, total, durationMs } = res;
    if (durationMs < MIN_CLIP_MS || total === 0) {
      if (my.mode !== 'local') {
        socket.send({ t: 'floor_release', clipId: recording.clipId, total: 0, durationMs: 0, recordedAt: 0 });
      }
      outbox.discard(recording.clipId);
      notice('Hold the button to talk', 2500);
      resumePlayback();
      return;
    }
    outbox.finish(recording.clipId, total, durationMs);
    if (my.mode === 'live') {
      // Send the tail chunk(s), then release: the server commits if it has
      // everything; otherwise the outbox fills the gaps over HTTP.
      for (let seq = recording.sentUpTo + 1; seq < total; seq++) {
        const bytes = clipFiles.readChunk(recording.clipId, seq);
        if (bytes && socket.sendBinary(encodeChunkFrame(recording.clipId, seq, bytes))) recording.sentUpTo = seq;
      }
      const recordedAt = getState().outbox.items[recording.clipId]?.recordedAt ?? serverNow();
      socket.send({ t: 'floor_release', clipId: recording.clipId, total, durationMs, recordedAt });
      setTimeout(() => void outbox.kick(), LIVE_SETTLE_MS);
    } else {
      if (my.mode === 'pending') {
        socket.send({ t: 'floor_release', clipId: recording.clipId, total: 0, durationMs: 0, recordedAt: 0 });
      }
      void outbox.kick();
    }
    resumePlayback();
  }

  // ── playback ────────────────────────────────────────────────────────────
  async function loadClip(msgId: string): Promise<Uint8Array | null> {
    if (getState().outbox.items[msgId]) return clipFiles.readAll(msgId);
    const cached = audioCache.get(msgId);
    if (cached) return cached;
    try {
      const res = await fetch(`${SERVER_URL}/clips/${msgId}/audio`);
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      audioCache.put(msgId, bytes);
      return bytes;
    } catch {
      return null;
    }
  }

  const busy = () => rec !== null || getState().floor.speaker !== null;

  async function play(msgId: string, fromMs = 0) {
    const bytes = await loadClip(msgId);
    if (!bytes) {
      notice('That message will play once you are back online', 3000);
      return;
    }
    if (busy()) {
      dispatch(enqueue([msgId]));
      return;
    }
    const durationMs = clipPlayer.play(bytes, fromMs, {
      onProgress: (ms) => dispatch(progress(ms)),
      onEnd: () => {
        dispatch(finished(msgId));
        if (!getState().outbox.items[msgId]) socket.send({ t: 'played', msgId });
        playNext();
      },
    });
    dispatch(started({ msgId, positionMs: fromMs, durationMs }));
  }

  function playNext() {
    if (busy() || getState().playback.current?.playing) return;
    const next = getState().playback.queue[0];
    if (next) void play(next);
  }

  function interruptPlayback() {
    const cur = getState().playback.current;
    if (!cur?.playing) return;
    clipPlayer.stop();
    resumeAfter = { msgId: cur.msgId, positionMs: cur.positionMs };
    dispatch(paused());
  }

  function resumePlayback() {
    if (busy()) return;
    const resume = resumeAfter;
    resumeAfter = null;
    if (resume) void play(resume.msgId, resume.positionMs);
    else playNext();
  }

  // ── wiring ──────────────────────────────────────────────────────────────
  const ticker = setInterval(() => dispatch(netEvent({ type: 'tick', at: Date.now() })), 250);
  const unsubNet = NetInfo.addEventListener((netState) => {
    if (netState.isConnected === false) socket.dropNow();
    else if (netState.isConnected) socket.retryNow();
  });
  // Streaming needs a good link: if it degrades mid-talk, keep recording and
  // send the clip whole afterwards (record-and-send).
  let lastNet = getState().connection.net;
  const unsubStore = store.subscribe(() => {
    const net = getState().connection.net;
    if (net === lastNet) return;
    lastNet = net;
    const my = getState().floor.my;
    if (my && my.mode !== 'local' && (net === 'weak' || net === 'offline')) dispatch(setMyMode('local'));
  });

  const controller = {
    async start() {
      outbox.restore();
      const granted = (await micPermission(false)) || (await micPermission(true));
      dispatch(setMicDenied(!granted));
      socket.start();
    },
    stop() {
      clearInterval(ticker);
      unsubNet();
      unsubStore();
      socket.stop();
    },
    pressIn() {
      dispatch(setHolding(true));
      // Someone is live: keep holding and you go live when they stop (04).
      if (getState().floor.speaker) return;
      void beginTalking();
    },
    pressOut() {
      dispatch(setHolding(false));
      if (rec) void endTalking();
    },
    togglePlay(msgId: string) {
      const cur = getState().playback.current;
      if (cur?.msgId === msgId && cur.playing) {
        clipPlayer.stop();
        dispatch(paused());
        dispatch(clearQueue());
        return;
      }
      if (busy()) return;
      void play(msgId, cur?.msgId === msgId ? cur.positionMs : 0);
    },
    replayAll() {
      const missed = getState().playback.missed;
      const order = channelApi.endpoints.getMessages.select()(getState()).data ?? [];
      dispatch(enqueue(order.filter((message) => missed.includes(message.id)).map((message) => message.id)));
      playNext();
    },
    stopPlayback() {
      clipPlayer.stop();
      dispatch(stopped());
    },
    retryNow() {
      socket.retryNow();
      outbox.kickNow();
    },
    /** New name: reconnect so the server announces it. */
    reconnect() {
      socket.stop();
      socket.start();
    },
    retryClip: (clipId: string) => outbox.retry(clipId),
    deleteQueued(clipId: string) {
      if (getState().playback.current?.msgId === clipId) controller.stopPlayback();
      outbox.discard(clipId);
    },
    markPlayed: (msgId: string) => socket.send({ t: 'played', msgId }),
    async askMic() {
      const ok = await micPermission(true);
      dispatch(setMicDenied(!ok));
      return ok;
    },
  };
  registry.controller = controller;
  return controller;
}

export type Controller = ReturnType<typeof createController>;
