import { startRecording, stopRecording } from '@/audio/recorder';
import { streamPlayer } from '@/audio/streamPlayer';
import { goLiveTone } from '@/audio/tone';
import type { AppStore } from '@/store';
import { netEvent } from '@/store/slices/connection';
import { setLevel, setMyTalkMode, startMyTalk, stopMyTalk } from '@/store/slices/floor';
import { CHUNK_MS, MAX_CLIP_MS, MIN_CLIP_MS, encodeChunkFrame } from '@shared/protocol';
import { randomUUID } from 'expo-crypto';
import { clipFiles } from './files';
import { buzz } from './haptics';
import type { Outbox } from './outbox';
import type { Playback } from './playback';
import type { Socket } from './socket';

// Talking: from pressing the button to handing the finished clip to the outbox.
//
// Every chunk is written to disk first. It is also streamed live, but only
// while I hold the floor (mode "live"). With a weak link, or if the server
// doesn't answer in time, the clip is just recorded (mode "local") and the
// outbox uploads it whole afterwards. See floor.ts for the three modes.

const FLOOR_ANSWER_TIMEOUT_MS = 1000; // no answer to floor_request → record-and-send
const LIVE_SETTLE_MS = 1500; // give in-flight live chunks a moment before the outbox checks the server

interface TalkDependencies {
  store: AppStore;
  socket: Socket;
  outbox: Outbox;
  playback: Playback;
  showNotice: (text: string, durationMs?: number) => void;
}

interface ActiveRecording {
  clipId: string;
  micStarted: Promise<boolean>;
  recordedChunks: number; // chunks written to disk so far
  lastChunkSentLive: number; // -1 until the first chunk goes out
  floorAnswerTimer: ReturnType<typeof setTimeout> | null;
  maximumLengthTimer: ReturnType<typeof setTimeout>;
}

export function createTalk({ store, socket, outbox, playback, showNotice }: TalkDependencies) {
  const { dispatch, getState } = store;
  const serverNow = () => Date.now() + getState().session.serverOffset;
  const myTalkMode = () => getState().floor.myTalk?.mode;

  let activeRecording: ActiveRecording | null = null;
  let lastChunkAcknowledgedLive = -1;

  /** Tell the server I'm done with the floor and there is no clip to commit (a tap, or a lost race). */
  function releaseFloorWithoutClip(clipId: string) {
    socket.send({ type: 'floor_release', clipId, total: 0, durationMs: 0, recordedAt: 0 });
  }

  /** Audio sent live but not yet acknowledged: one of the signals for "weak". */
  function reportLiveBacklog(recording: ActiveRecording) {
    const unacknowledgedChunks = Math.max(0, recording.lastChunkSentLive - lastChunkAcknowledgedLive);
    dispatch(netEvent({ type: 'backlog', at: Date.now(), ms: unacknowledgedChunks * CHUNK_MS }));
  }

  function sendChunkLive(recording: ActiveRecording, chunkIndex: number, bytes: Uint8Array) {
    if (socket.sendBinary(encodeChunkFrame(recording.clipId, chunkIndex, bytes))) recording.lastChunkSentLive = chunkIndex;
  }

  /** Streams chunks that are already on disk, from `fromChunk` up to (not including) `toChunk`. */
  function sendChunksLiveFromDisk(recording: ActiveRecording, fromChunk: number, toChunk: number) {
    for (let chunkIndex = fromChunk; chunkIndex < toChunk; chunkIndex++) {
      const bytes = clipFiles.readChunk(recording.clipId, chunkIndex);
      if (bytes) sendChunkLive(recording, chunkIndex, bytes);
    }
  }

  /** The server gave me the floor: start streaming, beginning with what was recorded while waiting. */
  function goLive(recording: ActiveRecording) {
    if (recording.floorAnswerTimer) clearTimeout(recording.floorAnswerTimer);
    recording.floorAnswerTimer = null;
    dispatch(setMyTalkMode('live'));
    buzz();
    goLiveTone();
    sendChunksLiveFromDisk(recording, recording.lastChunkSentLive + 1, recording.recordedChunks);
    reportLiveBacklog(recording);
  }

  async function begin(afterWaitingForSpeaker = false) {
    if (getState().floor.micDenied) return;
    playback.pauseForTalk();
    const clipId = randomUUID();
    const recordedAt = serverNow();
    const network = getState().connection.net;
    const canStream = socket.isUp && (network === 'online' || network === 'recovering');
    dispatch(startMyTalk({ clipId, startedAt: Date.now(), mode: canStream ? 'pending' : 'local' }));
    outbox.begin(clipId, recordedAt);
    lastChunkAcknowledgedLive = -1;

    const recording: ActiveRecording = {
      clipId,
      micStarted: Promise.resolve(false),
      recordedChunks: 0,
      lastChunkSentLive: -1,
      floorAnswerTimer: null,
      // Hard cap: stop with a buzz even if the finger is still down.
      maximumLengthTimer: setTimeout(() => {
        buzz();
        void end();
      }, MAX_CLIP_MS),
    };
    activeRecording = recording;
    streamPlayer.setMuted(true);

    recording.micStarted = startRecording({
      onChunk: (chunkIndex, bytes) => {
        clipFiles.writeChunk(clipId, chunkIndex, bytes); // disk first, then the wire
        if (activeRecording !== recording) return;
        recording.recordedChunks = chunkIndex + 1;
        if (myTalkMode() === 'live') {
          sendChunkLive(recording, chunkIndex, bytes);
          reportLiveBacklog(recording);
        }
      },
      onLevel: (level) => dispatch(setLevel(level)),
    });

    if (canStream) {
      socket.send({ type: 'floor_request', clipId, recordedAt });
      recording.floorAnswerTimer = setTimeout(() => {
        if (activeRecording === recording && myTalkMode() === 'pending') dispatch(setMyTalkMode('local'));
      }, FLOOR_ANSWER_TIMEOUT_MS);
    } else {
      buzz();
      if (afterWaitingForSpeaker) goLiveTone();
    }

    const micStarted = await recording.micStarted;
    if (!micStarted && activeRecording === recording) {
      await discard();
      showNotice('Could not open the microphone');
    }
  }

  /** Stops the mic and clears the timers. Returns the recording and its length, or null if none. */
  async function stopMic() {
    const recording = activeRecording;
    if (!recording) return null;
    activeRecording = null;
    if (recording.floorAnswerTimer) clearTimeout(recording.floorAnswerTimer);
    clearTimeout(recording.maximumLengthTimer);
    await recording.micStarted;
    const { total, durationMs } = await stopRecording();
    streamPlayer.setMuted(false);
    dispatch(netEvent({ type: 'backlog', at: Date.now(), ms: 0 }));
    return { recording, total, durationMs };
  }

  /** Throws the recording away: lost the race, or the mic failed. */
  async function discard() {
    const mode = myTalkMode();
    const stopped = await stopMic();
    dispatch(stopMyTalk());
    if (!stopped) return;
    if (mode === 'live' || mode === 'pending') releaseFloorWithoutClip(stopped.recording.clipId);
    outbox.discard(stopped.recording.clipId);
  }

  /** The finger lifted (or the 60-second cap hit): send the clip, or discard an accidental tap. */
  async function end() {
    const mode = myTalkMode();
    if (!activeRecording || !mode) return;
    const stopped = await stopMic();
    dispatch(stopMyTalk());
    if (!stopped) return;
    const { recording, total, durationMs } = stopped;

    if (durationMs < MIN_CLIP_MS || total === 0) {
      if (mode === 'live' || mode === 'pending') releaseFloorWithoutClip(recording.clipId);
      outbox.discard(recording.clipId);
      showNotice('Hold the button to talk', 2500);
    } else if (mode === 'live') {
      outbox.finish(recording.clipId, total, durationMs);
      // Send the last chunks, then release with the clip's details: the server
      // commits right away if it has everything; otherwise the outbox fills the gaps.
      sendChunksLiveFromDisk(recording, recording.lastChunkSentLive + 1, total);
      const recordedAt = getState().outbox.items[recording.clipId]?.recordedAt ?? serverNow();
      socket.send({ type: 'floor_release', clipId: recording.clipId, total, durationMs, recordedAt });
      setTimeout(() => void outbox.flush(), LIVE_SETTLE_MS);
    } else {
      outbox.finish(recording.clipId, total, durationMs);
      if (mode === 'pending') releaseFloorWithoutClip(recording.clipId);
      void outbox.flush();
    }
    playback.resumeAfterTalk();
  }

  return {
    begin,
    end,
    discard,
    isRecording: () => activeRecording !== null,
    /** Recording and streaming to everyone right now. */
    isLive: () => activeRecording !== null && myTalkMode() === 'live',
    isRecordingClip: (clipId: string) => activeRecording?.clipId === clipId,
    onFloorGranted(clipId: string) {
      // Ignore a late grant once the clip has already fallen back to record-and-send.
      if (activeRecording?.clipId === clipId && myTalkMode() !== 'local') goLive(activeRecording);
    },
    onLiveChunksAcknowledged(clipId: string, upTo: number) {
      if (activeRecording?.clipId !== clipId) return;
      lastChunkAcknowledgedLive = Math.max(lastChunkAcknowledgedLive, upTo);
      reportLiveBacklog(activeRecording);
    },
  };
}

export type Talk = ReturnType<typeof createTalk>;
