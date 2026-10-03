import type { AudioBufferSourceNode } from 'react-native-audio-api';
import { audioContext, mulawBuffer } from './context';

// Plays one recorded clip, with pause and resume-from-offset.
//
// The playhead comes from the audio thread (onPositionChanged), so pausing
// remembers exactly where the listener was. The UI doesn't poll it: the
// progress pill animates on its own from the start position (MessageRow.tsx).

const POSITION_UPDATE_MS = 50;

let node: AudioBufferSourceNode | null = null;
let token = 0;
let positionMs = 0;

export const clipPlayer = {
  /** Starts playing at `fromMs` (from the start if that is at the end). Returns where it started and the clip length. */
  play(bytes: Uint8Array, fromMs: number, onEnd: () => void): { startMs: number; durationMs: number } {
    clipPlayer.stop();
    const context = audioContext();
    const audioBuffer = mulawBuffer(bytes);
    const durationMs = audioBuffer.duration * 1000;
    const startMs = fromMs >= durationMs - 50 ? 0 : fromMs;
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const playToken = ++token;
    positionMs = startMs;
    source.onPositionChangedInterval = POSITION_UPDATE_MS;
    source.onPositionChanged = (event) => {
      if (playToken === token) positionMs = event.value * 1000;
    };
    source.onEnded = () => {
      if (playToken !== token) return; // stopped or replaced, not a natural end
      clipPlayer.stop();
      onEnd();
    };
    source.start(context.currentTime, startMs / 1000);
    node = source;
    return { startMs, durationMs };
  },
  /** Where the clip is right now, in milliseconds. */
  positionMs() {
    return positionMs;
  },
  stop() {
    token++;
    if (node) {
      node.onPositionChanged = null;
      try {
        node.stop();
      } catch {}
      node = null;
    }
  },
};
