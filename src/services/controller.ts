import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { clipPlayer } from '@/audio/clipPlayer';
import { debugTrace } from '@/utils/debugTrace'; // TEMP DEBUG
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
import { mulawRootMeanSquare } from '@shared/mulaw';
import {
  CHUNK_MS,
  CHUNK_SAMPLES,
  MAX_CLIP_MS,
  MIN_CLIP_MS,
  decodeChunkFrame,
  encodeChunkFrame,
  type ChannelMessage,
  type ServerMessage,
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
  subscribe(listener: () => void): () => void;
}

const heavyHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
const doubleBuzz = () => {
  heavyHaptic();
  setTimeout(heavyHaptic, 140);
};

/** How many chunks a committed clip has; used to tell "heard it all live". */
const chunkCountFor = (durationMs: number) => Math.ceil(Math.round((durationMs * 8000) / 1000) / CHUNK_SAMPLES);

export function createController(store: Store) {
  const { dispatch, getState } = store;
  const serverNow = () => Date.now() + getState().session.serverOffset;

  // ── talking state that does not belong in Redux (timers, counters) ──────
  let activeRecording: {
    clipId: string;
    startPromise: Promise<boolean>;
    sentUpTo: number; // last chunk sent live
    recorded: number; // chunks written to disk
    grantTimer: ReturnType<typeof setTimeout> | null;
    maxTimer: ReturnType<typeof setTimeout> | null;
  } | null = null;
  let lastLiveChunkAcked = -1;
  let resumeAfter: { messageId: string; positionMs: number } | null = null;
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
      return { type: 'hello', clientId: session.clientId, name: session.name ?? 'Unknown', lastSeq: session.lastSeq };
    },
    onLinkUp: () => dispatch(netEvent({ type: 'link_up', at: Date.now() })),
    onLinkDown: () => {
      dispatch(netEvent({ type: 'link_down', at: Date.now() }));
      // We can no longer hear the speaker or reach listeners.
      streamPlayer.end();
      dispatch(setSpeaker(null));
      if (getState().floor.my && getState().floor.my!.mode !== 'local') dispatch(setMyMode('local'));
    },
    onPong: (roundTripMs, serverTime) => {
      dispatch(netEvent({ type: 'pong', at: Date.now(), roundTripMs }));
      const offset = Math.round(serverTime - Date.now());
      if (Math.abs(offset - getState().session.serverOffset) > 250) dispatch(setServerOffset(offset));
    },
    onPingMissed: () => dispatch(netEvent({ type: 'ping_missed', at: Date.now() })),
    onRetryScheduled: (at) => dispatch(setNextRetry(at)),
    onMessage,
    onBinary,
  });

  function onMessage(message: ServerMessage) {
    switch (message.type) {
      case 'welcome': {
        dispatch(setOnline(message.online));
        dispatch(setServerOffset(message.serverTime - Date.now()));
        const myClientId = getState().session.clientId;
        dispatch(setSpeaker(message.floor && message.floor.clientId !== myClientId ? message.floor : null));
        const firstJoin = getState().session.lastSeq === 0;
        const fresh = onCommitted(message.missed, firstJoin);
        if (getState().connection.net === 'recovering') dispatch(setMissedOnReturn(fresh));
        outbox.kickNow();
        break;
      }
      case 'presence':
        dispatch(setOnline(message.online));
        break;
      case 'floor_granted':
        if (activeRecording && activeRecording.clipId === message.clipId && getState().floor.my?.mode !== 'local') goLive();
        break;
      case 'floor_denied':
        if (activeRecording && activeRecording.clipId === message.clipId) {
          // Lost the race: nothing is recorded. Keep holding to go next.
          void discardRecording();
          dispatch(setDenied(message.speaker));
          dispatch(setSpeaker(message.speaker));
          streamPlayer.begin(message.speaker.clipId);
          doubleBuzz();
        }
        break;
      case 'floor_taken': {
        dispatch(setSpeaker(message.speaker));
        streamPlayer.begin(message.speaker.clipId);
        interruptPlayback();
        break;
      }
      case 'floor_free': {
        const speaker = getState().floor.speaker;
        if (!speaker || speaker.clipId !== message.clipId) break;
        streamPlayer.end();
        dispatch(setSpeaker(null));
        dispatch(setLevel(0));
        if (message.reason !== 'released') {
          notice(`${speaker.name}'s signal dropped — the message will arrive in full`);
        }
        // Still holding after losing the race: you go live the moment they stop.
        if (getState().floor.holding && !activeRecording) {
          dispatch(setDenied(null));
          void beginTalking(true);
        } else {
          resumePlayback();
        }
        break;
      }
      case 'chunk_ack':
        outbox.acked(message.clipId, message.upTo);
        if (activeRecording?.clipId === message.clipId) {
          lastLiveChunkAcked = Math.max(lastLiveChunkAcked, message.upTo);
          reportBacklog();
        }
        break;
      case 'message':
        onCommitted([message.message], false);
        break;
      case 'receipt':
        dispatch(setHeardBy(message.messageId, message.heardBy));
        break;
    }
  }

  function onBinary(data: Uint8Array) {
    const frame = decodeChunkFrame(data);
    const speaker = getState().floor.speaker;
    if (!frame || !speaker || speaker.clipId !== frame.clipId) return;
    if (activeRecording && getState().floor.my?.mode === 'live') return; // half duplex
    streamPlayer.chunk(frame.clipId, frame.seq, frame.payload);
    dispatch(setLevel(Math.min(1, mulawRootMeanSquare(frame.payload) * 4)));
  }

  /**
   * New committed messages, from the socket, a catch-up, or my own upload.
   * Returns how many were missed (not heard live) — the "2 missed" count.
   */
  function onCommitted(list: ChannelMessage[], asHistory: boolean): number {
    if (list.length === 0) return 0;
    dispatch(upsertMessages(list));
    dispatch(advanceSeq(Math.max(...list.map((message) => message.seq))));
    const myClientId = getState().session.clientId;
    const missed: string[] = [];
    for (const message of list) {
      if (message.senderId === myClientId) {
        outbox.committed(message.id);
        continue;
      }
      if (streamPlayer.heardChunks(message.id) >= chunkCountFor(message.durationMs)) {
        socket.send({ type: 'played', messageId: message.id }); // heard it all live
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
    if (!activeRecording) return;
    if (socket.sendBinary(encodeChunkFrame(activeRecording.clipId, seq, bytes))) activeRecording.sentUpTo = seq;
    reportBacklog();
  }

  function reportBacklog() {
    if (!activeRecording) return;
    const ms = Math.max(0, activeRecording.sentUpTo - lastLiveChunkAcked) * CHUNK_MS;
    dispatch(netEvent({ type: 'backlog', at: Date.now(), ms }));
  }

  function goLive() {
    if (!activeRecording) return;
    if (activeRecording.grantTimer) clearTimeout(activeRecording.grantTimer);
    activeRecording.grantTimer = null;
    dispatch(setMyMode('live'));
    heavyHaptic();
    goLiveTone();
    // Send what was recorded while the floor request was in flight.
    for (let seq = activeRecording.sentUpTo + 1; seq < activeRecording.recorded; seq++) {
      const bytes = clipFiles.readChunk(activeRecording.clipId, seq);
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
    debugTrace.log('startMine', { mode, canStream }); // TEMP DEBUG
    outbox.begin(clipId, recordedAt);
    lastLiveChunkAcked = -1;
    const recording: NonNullable<typeof activeRecording> = {
      clipId,
      startPromise: Promise.resolve(false),
      sentUpTo: -1,
      recorded: 0,
      grantTimer: null,
      maxTimer: setTimeout(() => {
        // Hard cap: stop with a buzz even if the finger is still down.
        heavyHaptic();
        void endTalking();
      }, MAX_CLIP_MS),
    };
    activeRecording = recording;
    streamPlayer.setMuted(true);
    recording.startPromise = startRecording({
      onChunk: (seq, bytes) => {
        debugTrace.log('chunk', { seq }); // TEMP DEBUG
        clipFiles.writeChunk(clipId, seq, bytes); // disk first, then the wire
        if (activeRecording !== recording) return;
        recording.recorded = seq + 1;
        if (getState().floor.my?.mode === 'live') sendLive(seq, bytes);
      },
      onLevel: (level) => dispatch(setLevel(level)),
    });
    if (canStream) {
      socket.send({ type: 'floor_request', clipId, recordedAt });
      recording.grantTimer = setTimeout(() => {
        if (activeRecording === recording && getState().floor.my?.mode === 'pending') dispatch(setMyMode('local'));
      }, GRANT_TIMEOUT_MS);
    } else {
      heavyHaptic();
    }
    if (afterWait && !canStream) goLiveTone();
    const micStarted = await recording.startPromise;
    debugTrace.log('micStarted', { micStarted }); // TEMP DEBUG
    if (!micStarted && activeRecording === recording) {
      await discardRecording();
      notice('Could not open the microphone');
    }
  }

  async function finishRecording() {
    const recording = activeRecording;
    if (!recording) return null;
    activeRecording = null;
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
      socket.send({ type: 'floor_release', clipId: res.recording.clipId, total: 0, durationMs: 0, recordedAt: 0 });
    }
    outbox.discard(res.recording.clipId);
  }

  async function endTalking() {
    const my = getState().floor.my;
    if (!activeRecording || !my) return;
    const res = await finishRecording();
    dispatch(stopMine());
    if (!res) return;
    const { recording, total, durationMs } = res;
    if (durationMs < MIN_CLIP_MS || total === 0) {
      if (my.mode !== 'local') {
        socket.send({ type: 'floor_release', clipId: recording.clipId, total: 0, durationMs: 0, recordedAt: 0 });
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
      socket.send({ type: 'floor_release', clipId: recording.clipId, total, durationMs, recordedAt });
      setTimeout(() => void outbox.kick(), LIVE_SETTLE_MS);
    } else {
      if (my.mode === 'pending') {
        socket.send({ type: 'floor_release', clipId: recording.clipId, total: 0, durationMs: 0, recordedAt: 0 });
      }
      void outbox.kick();
    }
    resumePlayback();
  }

  // ── playback ────────────────────────────────────────────────────────────
  async function loadClip(messageId: string): Promise<Uint8Array | null> {
    if (getState().outbox.items[messageId]) return clipFiles.readAll(messageId);
    const cached = audioCache.get(messageId);
    if (cached) return cached;
    try {
      const res = await fetch(`${SERVER_URL}/clips/${messageId}/audio`);
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      audioCache.put(messageId, bytes);
      return bytes;
    } catch {
      return null;
    }
  }

  const busy = () => activeRecording !== null || getState().floor.speaker !== null;

  async function play(messageId: string, fromMs = 0) {
    const bytes = await loadClip(messageId);
    if (!bytes) {
      notice('That message will play once you are back online', 3000);
      return;
    }
    if (busy()) {
      dispatch(enqueue([messageId]));
      return;
    }
    const durationMs = clipPlayer.play(bytes, fromMs, {
      onProgress: (ms) => dispatch(progress(ms)),
      onEnd: () => {
        dispatch(finished(messageId));
        if (!getState().outbox.items[messageId]) socket.send({ type: 'played', messageId });
        playNext();
      },
    });
    dispatch(started({ messageId, positionMs: fromMs, durationMs }));
  }

  function playNext() {
    if (busy() || getState().playback.current?.playing) return;
    const next = getState().playback.queue[0];
    if (next) void play(next);
  }

  function interruptPlayback() {
    const currentPlayback = getState().playback.current;
    if (!currentPlayback?.playing) return;
    clipPlayer.stop();
    resumeAfter = { messageId: currentPlayback.messageId, positionMs: currentPlayback.positionMs };
    dispatch(paused());
  }

  function resumePlayback() {
    if (busy()) return;
    const resume = resumeAfter;
    resumeAfter = null;
    if (resume) void play(resume.messageId, resume.positionMs);
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
      debugTrace.begin({ net: getState().connection.net, socketUp: socket.isUp, speaker: !!getState().floor.speaker }); // TEMP DEBUG
      dispatch(setHolding(true));
      // Someone is live: keep holding and you go live when they stop (04).
      if (getState().floor.speaker) return;
      void beginTalking();
    },
    pressOut() {
      debugTrace.end({ my: getState().floor.my, recording: activeRecording ? { recorded: activeRecording.recorded } : null }); // TEMP DEBUG
      dispatch(setHolding(false));
      if (activeRecording) void endTalking();
    },
    togglePlay(messageId: string) {
      const currentPlayback = getState().playback.current;
      if (currentPlayback?.messageId === messageId && currentPlayback.playing) {
        clipPlayer.stop();
        dispatch(paused());
        dispatch(clearQueue());
        return;
      }
      if (busy()) return;
      void play(messageId, currentPlayback?.messageId === messageId ? currentPlayback.positionMs : 0);
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
      if (getState().playback.current?.messageId === clipId) controller.stopPlayback();
      outbox.discard(clipId);
    },
    markPlayed: (messageId: string) => socket.send({ type: 'played', messageId }),
    async askMic() {
      const micStarted = await micPermission(true);
      dispatch(setMicDenied(!micStarted));
      return micStarted;
    },
  };
  registry.controller = controller;
  return controller;
}

export type Controller = ReturnType<typeof createController>;
