import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { messageCache } from '@/services/db';
import type { ChannelMessage } from '@shared/protocol';

const SHIFT_MS = 12 * 60 * 60 * 1000;

// The committed message list, ordered by server seq. It starts from SQLite (so
// the list is there instantly, even offline) and is then kept current by socket
// events, which the controller dispatches. The store's listener middleware
// writes changes back to SQLite.

export interface MessagesState {
  list: ChannelMessage[];
}

function load(): MessagesState {
  messageCache.prune(Date.now() - SHIFT_MS);
  return { list: messageCache.load() };
}

const messages = createSlice({
  name: 'messages',
  initialState: load,
  reducers: {
    upsertMessages(state, action: PayloadAction<ChannelMessage[]>) {
      for (const message of action.payload) {
        const index = state.list.findIndex((existing) => existing.id === message.id);
        if (index >= 0) state.list[index] = message;
        else state.list.push(message);
      }
      state.list.sort((first, second) => first.seq - second.seq);
    },
    setHeardBy(state, action: PayloadAction<{ messageId: string; heardBy: number }>) {
      const message = state.list.find((existing) => existing.id === action.payload.messageId);
      if (message) message.heardBy = action.payload.heardBy;
    },
  },
});

export const { upsertMessages, setHeardBy } = messages.actions;
export default messages.reducer;
