import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { randomUUID } from 'expo-crypto';
import { kv } from '@/services/db';

export interface SessionState {
  name: string | null;
  clientId: string;
  lastSeq: number;
  serverOffset: number; // serverTime - Date.now(), so offline clips get server-clock timestamps
}

function load(): SessionState {
  let clientId = kv.get<string | null>('clientId', null);
  if (!clientId) {
    clientId = randomUUID();
    kv.set('clientId', clientId);
  }
  return {
    name: kv.get<string | null>('name', null),
    clientId,
    lastSeq: kv.get<number>('lastSeq', 0),
    serverOffset: kv.get<number>('serverOffset', 0),
  };
}

const session = createSlice({
  name: 'session',
  initialState: load,
  reducers: {
    setName(s, a: PayloadAction<string>) {
      s.name = a.payload;
    },
    advanceSeq(s, a: PayloadAction<number>) {
      if (a.payload > s.lastSeq) s.lastSeq = a.payload;
    },
    setServerOffset(s, a: PayloadAction<number>) {
      s.serverOffset = a.payload;
    },
  },
});

export const { setName, advanceSeq, setServerOffset } = session.actions;
export default session.reducer;
