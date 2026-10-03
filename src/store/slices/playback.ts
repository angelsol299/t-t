import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface CurrentPlayback {
  messageId: string;
  durationMs: number;
  playing: boolean;
  // Where playback started, or where it was paused. It does not tick while
  // playing: the progress pill animates from here by itself.
  positionMs: number;
}

export interface PlaybackState {
  current: CurrentPlayback | null;
  queue: string[]; // auto-play order, oldest first
  missed: string[]; // ids tagged MISSED until played to the end
}

const playback = createSlice({
  name: 'playback',
  // Defaults only: the saved MISSED list is loaded at launch (store/persistence.ts).
  initialState: (): PlaybackState => ({ current: null, queue: [], missed: [] }),
  reducers: {
    markMissed(state, action: PayloadAction<string[]>) {
      for (const id of action.payload) if (!state.missed.includes(id)) state.missed.push(id);
    },
    enqueue(state, action: PayloadAction<string[]>) {
      for (const id of action.payload) if (!state.queue.includes(id) && state.current?.messageId !== id) state.queue.push(id);
    },
    clearQueue(state) {
      state.queue = [];
    },
    started(state, action: PayloadAction<{ messageId: string; positionMs: number; durationMs: number }>) {
      state.current = { ...action.payload, playing: true };
      state.queue = state.queue.filter((id) => id !== action.payload.messageId);
    },
    paused(state, action: PayloadAction<{ positionMs: number }>) {
      if (!state.current) return;
      state.current.playing = false;
      state.current.positionMs = action.payload.positionMs;
    },
    /** Played to the end: clears MISSED. Stopping halfway keeps it. */
    finished(state, action: PayloadAction<string>) {
      state.missed = state.missed.filter((id) => id !== action.payload);
      if (state.current?.messageId === action.payload) state.current = null;
    },
    stopped(state) {
      state.current = null;
    },
  },
});

export const { markMissed, enqueue, clearQueue, started, paused, finished, stopped } = playback.actions;
export default playback.reducer;
