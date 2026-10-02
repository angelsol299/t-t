import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { OutboxItem } from '@/services/db';

// Mirror of the SQLite outbox: my clips that the server has not committed yet.
// `progress` is the share of chunks the server has (0..1), for "Sending N%".

export type OutboxEntry = OutboxItem & { progress: number };

export interface OutboxState {
  items: Record<string, OutboxEntry>;
}

const outbox = createSlice({
  name: 'outbox',
  initialState: { items: {} } as OutboxState,
  reducers: {
    upsert(state, action: PayloadAction<OutboxEntry>) {
      state.items[action.payload.clipId] = action.payload;
    },
    patch(state, action: PayloadAction<{ clipId: string } & Partial<OutboxEntry>>) {
      const item = state.items[action.payload.clipId];
      if (item) Object.assign(item, action.payload);
    },
    remove(state, action: PayloadAction<string>) {
      delete state.items[action.payload];
    },
  },
});

export const outboxActions = outbox.actions;
export default outbox.reducer;
