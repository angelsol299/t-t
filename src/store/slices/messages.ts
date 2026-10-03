import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ChannelMessage } from '@shared/protocol';

// The committed message list, ordered by server seq. It is loaded from SQLite
// at launch (so the list is there instantly, even offline) and then kept
// current by socket events. Saving is in store/persistence.ts.

export interface MessagesState {
  list: ChannelMessage[];
}

const messages = createSlice({
  name: 'messages',
  initialState: { list: [] } as MessagesState,
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
