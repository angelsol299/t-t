import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { initialNetState, netReducer, type NetEvent, type NetState } from '@shared/netMachine';

export interface ConnectionState extends NetState {
  online: number; // people on the channel
  onlineAtDrop: number | null; // "6 online when you lost signal"
  nextRetryAt: number | null;
  missedOnReturn: number | null; // "Back online — 2 missed"
}

const connection = createSlice({
  name: 'connection',
  initialState: (): ConnectionState => ({
    ...initialNetState(Date.now()),
    online: 0,
    onlineAtDrop: null,
    nextRetryAt: null,
    missedOnReturn: null,
  }),
  reducers: {
    netEvent(s, a: PayloadAction<NetEvent>) {
      const prev = s.net;
      const next = netReducer(s, a.payload);
      Object.assign(s, next);
      if (prev !== 'offline' && next.net === 'offline') s.onlineAtDrop = s.online;
      if (prev === 'recovering' && next.net !== 'recovering') s.missedOnReturn = null;
    },
    setOnline(s, a: PayloadAction<number>) {
      s.online = a.payload;
    },
    setNextRetry(s, a: PayloadAction<number | null>) {
      s.nextRetryAt = a.payload;
    },
    setMissedOnReturn(s, a: PayloadAction<number | null>) {
      s.missedOnReturn = a.payload;
    },
  },
});

export const { netEvent, setOnline, setNextRetry, setMissedOnReturn } = connection.actions;
export default connection.reducer;
