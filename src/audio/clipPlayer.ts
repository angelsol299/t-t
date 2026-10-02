import type { AudioBufferSourceNode } from 'react-native-audio-api';
import { audioContext, mulawBuffer } from './context';

// Plays one recorded clip with position tracking, pause and resume-from-offset.

let node: AudioBufferSourceNode | null = null;
let token = 0;
let ticker: ReturnType<typeof setInterval> | null = null;

export interface PlayHandlers {
  onProgress(positionMs: number): void;
  onEnd(): void;
}

export const clipPlayer = {
  play(bytes: Uint8Array, fromMs: number, handlers: PlayHandlers): number {
    clipPlayer.stop();
    const context = audioContext();
    const audioBuffer = mulawBuffer(bytes);
    const durationMs = audioBuffer.duration * 1000;
    const offsetMs = fromMs >= durationMs - 50 ? 0 : fromMs;
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const playToken = ++token;
    const startedAt = context.currentTime;
    source.onEnded = () => {
      if (playToken !== token) return; // stopped or replaced, not a natural end
      clipPlayer.stop();
      handlers.onEnd();
    };
    source.start(startedAt, offsetMs / 1000);
    node = source;
    ticker = setInterval(() => {
      if (playToken !== token) return;
      handlers.onProgress(Math.min(durationMs, offsetMs + (context.currentTime - startedAt) * 1000));
    }, 100);
    return durationMs;
  },
  stop() {
    token++;
    if (ticker) clearInterval(ticker);
    ticker = null;
    if (node) {
      try {
        node.stop();
      } catch {}
      node = null;
    }
  },
};
