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
    upsert(s, a: PayloadAction<OutboxEntry>) {
      s.items[a.payload.clipId] = a.payload;
    },
    patch(s, a: PayloadAction<{ clipId: string } & Partial<OutboxEntry>>) {
      const item = s.items[a.payload.clipId];
      if (item) Object.assign(item, a.payload);
    },
    remove(s, a: PayloadAction<string>) {
      delete s.items[a.payload];
    },
  },
});

export const outboxActions = outbox.actions;
export default outbox.reducer;
