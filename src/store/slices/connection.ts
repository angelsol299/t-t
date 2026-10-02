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
    netEvent(state, action: PayloadAction<NetEvent>) {
      const prev = state.net;
      const next = netReducer(state, action.payload);
      Object.assign(state, next);
      if (prev !== 'offline' && next.net === 'offline') state.onlineAtDrop = state.online;
      if (prev === 'recovering' && next.net !== 'recovering') state.missedOnReturn = null;
    },
    setOnline(state, action: PayloadAction<number>) {
      state.online = action.payload;
    },
    setNextRetry(state, action: PayloadAction<number | null>) {
      state.nextRetryAt = action.payload;
    },
    setMissedOnReturn(state, action: PayloadAction<number | null>) {
      state.missedOnReturn = action.payload;
    },
  },
});

export const { netEvent, setOnline, setNextRetry, setMissedOnReturn } = connection.actions;
export default connection.reducer;
