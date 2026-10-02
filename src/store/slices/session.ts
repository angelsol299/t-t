import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { randomUUID } from 'expo-crypto';
import { keyValueStore } from '@/services/db';

export interface SessionState {
  name: string | null;
  clientId: string;
  lastSeq: number;
  serverOffset: number; // serverTime - Date.now(), so offline clips get server-clock timestamps
}

function load(): SessionState {
  let clientId = keyValueStore.get<string | null>('clientId', null);
  if (!clientId) {
    clientId = randomUUID();
    keyValueStore.set('clientId', clientId);
  }
  return {
    name: keyValueStore.get<string | null>('name', null),
    clientId,
    lastSeq: keyValueStore.get<number>('lastSeq', 0),
    serverOffset: keyValueStore.get<number>('serverOffset', 0),
  };
}

const session = createSlice({
  name: 'session',
  initialState: load,
  reducers: {
    setName(state, action: PayloadAction<string>) {
      state.name = action.payload;
    },
    advanceSeq(state, action: PayloadAction<number>) {
      if (action.payload > state.lastSeq) state.lastSeq = action.payload;
    },
    setServerOffset(state, action: PayloadAction<number>) {
      state.serverOffset = action.payload;
    },
  },
});

export const { setName, advanceSeq, setServerOffset } = session.actions;
export default session.reducer;
