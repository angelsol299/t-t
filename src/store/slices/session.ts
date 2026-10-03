import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SessionState {
  name: string | null;
  clientId: string;
  lastSeq: number;
  serverOffset: number; // serverTime - Date.now(), so offline clips get server-clock timestamps
}

// Defaults only: the saved values are loaded at launch (store/persistence.ts).
const initialState: SessionState = { name: null, clientId: '', lastSeq: 0, serverOffset: 0 };

const session = createSlice({
  name: 'session',
  initialState,
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
