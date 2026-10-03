import { clipPlayer } from '@/audio/clipPlayer';
import { SERVER_URL } from '@/config';
import type { AppStore } from '@/store';
import { clearQueue, enqueue, finished, paused, progress, started, stopped } from '@/store/slices/playback';
import { audioCache, clipFiles } from './files';
import type { Socket } from './socket';

// Playing recorded messages: one at a time, from a queue (oldest first), and
// only while nobody is talking. Live talk, mine or someone else's, always comes
// first: it pauses playback, which picks up where it stopped afterwards.

interface PlaybackDependencies {
  store: AppStore;
  socket: Socket;
  showNotice: (text: string, durationMs?: number) => void;
  /** True while I'm recording or someone else is live. */
  isSomeoneTalking: () => boolean;
}

export function createPlayback({ store, socket, showNotice, isSomeoneTalking }: PlaybackDependencies) {
  const { dispatch, getState } = store;
  // Where live talk interrupted a message, to continue from there afterwards.
  let pausedForTalk: { messageId: string; positionMs: number } | null = null;

  /** My own unsent clip from disk, a cached download, or a fresh download. */
  async function loadClip(messageId: string): Promise<Uint8Array | null> {
    if (getState().outbox.items[messageId]) return clipFiles.readAll(messageId);
    const cached = audioCache.get(messageId);
    if (cached) return cached;
    try {
      const response = await fetch(`${SERVER_URL}/clips/${messageId}/audio`);
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      audioCache.put(messageId, bytes);
      return bytes;
    } catch {
      return null;
    }
  }

  async function play(messageId: string, fromMs = 0) {
    const bytes = await loadClip(messageId);
    if (!bytes) {
      showNotice('That message will play once you are back online', 3000);
      return;
    }
    if (isSomeoneTalking()) {
      dispatch(enqueue([messageId]));
      return;
    }
    const durationMs = clipPlayer.play(bytes, fromMs, {
      onProgress: (positionMs) => dispatch(progress(positionMs)),
      onEnd: () => {
        dispatch(finished(messageId));
        // A receipt only makes sense for messages on the server, not my unsent ones.
        if (!getState().outbox.items[messageId]) socket.send({ type: 'played', messageId });
        playNext();
      },
    });
    dispatch(started({ messageId, positionMs: fromMs, durationMs }));
  }

  function playNext() {
    if (isSomeoneTalking() || getState().playback.current?.playing) return;
    const next = getState().playback.queue[0];
    if (next) void play(next);
  }

  function stop() {
    clipPlayer.stop();
    dispatch(stopped());
  }

  return {
    playNext,
    stop,
    /** Live talk started: pause, remembering where. */
    pauseForTalk() {
      const current = getState().playback.current;
      if (!current?.playing) return;
      clipPlayer.stop();
      pausedForTalk = { messageId: current.messageId, positionMs: current.positionMs };
      dispatch(paused());
    },
    /** Live talk ended: pick up where we stopped, or play the next queued message. */
    resumeAfterTalk() {
      if (isSomeoneTalking()) return;
      const resume = pausedForTalk;
      pausedForTalk = null;
      if (resume) void play(resume.messageId, resume.positionMs);
      else playNext();
    },
    /** The play/pause button on a row. Pausing also cancels the auto-play queue. */
    toggle(messageId: string) {
      const current = getState().playback.current;
      if (current?.messageId === messageId && current.playing) {
        clipPlayer.stop();
        dispatch(paused());
        dispatch(clearQueue());
        return;
      }
      if (isSomeoneTalking()) return;
      void play(messageId, current?.messageId === messageId ? current.positionMs : 0);
    },
    /** "Replay all" on the back-online band: queue every MISSED message, oldest first. */
    playAllMissed() {
      const missed = getState().playback.missed;
      const missedInOrder = getState().messages.list.filter((message) => missed.includes(message.id));
      dispatch(enqueue(missedInOrder.map((message) => message.id)));
      playNext();
    },
    stopIfPlaying(messageId: string) {
      if (getState().playback.current?.messageId === messageId) stop();
    },
  };
}

export type Playback = ReturnType<typeof createPlayback>;
