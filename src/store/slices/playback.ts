import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { kv } from '@/services/db';

export interface PlaybackState {
  current: { msgId: string; positionMs: number; durationMs: number; playing: boolean } | null;
  queue: string[]; // auto-play order, oldest first
  missed: string[]; // ids tagged MISSED until played to the end
}

const playback = createSlice({
  name: 'playback',
  initialState: (): PlaybackState => ({ current: null, queue: [], missed: kv.get<string[]>('missed', []) }),
  reducers: {
    markMissed(s, a: PayloadAction<string[]>) {
      for (const id of a.payload) if (!s.missed.includes(id)) s.missed.push(id);
    },
    enqueue(s, a: PayloadAction<string[]>) {
      for (const id of a.payload) if (!s.queue.includes(id) && s.current?.msgId !== id) s.queue.push(id);
    },
    clearQueue(s) {
      s.queue = [];
    },
    started(s, a: PayloadAction<{ msgId: string; positionMs: number; durationMs: number }>) {
      s.current = { ...a.payload, playing: true };
      s.queue = s.queue.filter((id) => id !== a.payload.msgId);
    },
    progress(s, a: PayloadAction<number>) {
      if (s.current) s.current.positionMs = a.payload;
    },
    paused(s) {
      if (s.current) s.current.playing = false;
    },
    /** Played to the end: clears MISSED. Stopping halfway keeps it. */
    finished(s, a: PayloadAction<string>) {
      s.missed = s.missed.filter((id) => id !== a.payload);
      if (s.current?.msgId === a.payload) s.current = null;
    },
    stopped(s) {
      s.current = null;
    },
  },
});

export const { markMissed, enqueue, clearQueue, started, progress, paused, finished, stopped } = playback.actions;
export default playback.reducer;
