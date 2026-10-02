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
  play(bytes: Uint8Array, fromMs: number, h: PlayHandlers): number {
    clipPlayer.stop();
    const ctx = audioContext();
    const buf = mulawBuffer(bytes);
    const durationMs = buf.duration * 1000;
    const offsetMs = fromMs >= durationMs - 50 ? 0 : fromMs;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const my = ++token;
    const startedAt = ctx.currentTime;
    src.onEnded = () => {
      if (my !== token) return; // stopped or replaced, not a natural end
      clipPlayer.stop();
      h.onEnd();
    };
    src.start(startedAt, offsetMs / 1000);
    node = src;
    ticker = setInterval(() => {
      if (my !== token) return;
      h.onProgress(Math.min(durationMs, offsetMs + (ctx.currentTime - startedAt) * 1000));
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
