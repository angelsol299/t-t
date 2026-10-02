import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Speaker } from '@shared/protocol';

// `mode` says how my current recording travels:
//   pending — floor requested, waiting for the server (recording already)
//   live    — I hold the floor; chunks stream to everyone as I talk
//   local   — weak/offline (or I lost the floor mid-clip); recorded and sent after
export type TalkMode = 'pending' | 'live' | 'local';

export interface FloorState {
  speaker: Speaker | null; // someone else is live
  holding: boolean; // finger on the button
  my: { clipId: string; startedAt: number; mode: TalkMode } | null;
  denied: Speaker | null; // 08: lost the race and still holding
  level: number; // 0..1, mine while talking, the speaker's while listening
  notice: string | null; // transient line under the channel name
  micDenied: boolean;
}

const initialState: FloorState = {
  speaker: null,
  holding: false,
  my: null,
  denied: null,
  level: 0,
  notice: null,
  micDenied: false,
};

const floor = createSlice({
  name: 'floor',
  initialState,
  reducers: {
    setHolding(state, action: PayloadAction<boolean>) {
      state.holding = action.payload;
      if (!action.payload) state.denied = null;
    },
    startMine(state, action: PayloadAction<{ clipId: string; startedAt: number; mode: TalkMode }>) {
      state.my = action.payload;
      state.denied = null;
      state.notice = null;
    },
    setMyMode(state, action: PayloadAction<TalkMode>) {
      if (state.my) state.my.mode = action.payload;
    },
    stopMine(state) {
      state.my = null;
      state.level = 0;
    },
    setSpeaker(state, action: PayloadAction<Speaker | null>) {
      state.speaker = action.payload;
      if (!action.payload && !state.my) state.level = 0;
    },
    setDenied(state, action: PayloadAction<Speaker | null>) {
      state.denied = action.payload;
    },
    setLevel(state, action: PayloadAction<number>) {
      state.level = action.payload;
    },
    setNotice(state, action: PayloadAction<string | null>) {
      state.notice = action.payload;
    },
    setMicDenied(state, action: PayloadAction<boolean>) {
      state.micDenied = action.payload;
    },
  },
});

export const { setHolding, startMine, setMyMode, stopMine, setSpeaker, setDenied, setLevel, setNotice, setMicDenied } =
  floor.actions;
export default floor.reducer;
