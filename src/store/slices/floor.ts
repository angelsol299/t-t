import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Speaker } from '@shared/protocol';

// `mode` says how my current recording travels:
//   pending — floor requested, waiting for the server (recording already)
//   live    — I hold the floor; chunks stream to everyone as I talk
//   local   — weak/offline (or I lost the floor mid-clip); recorded and sent after
export type TalkMode = 'pending' | 'live' | 'local';

export interface MyTalk {
  clipId: string;
  startedAt: number;
  mode: TalkMode;
}

export interface FloorState {
  speaker: Speaker | null; // someone else is live
  holding: boolean; // finger on the button
  myTalk: MyTalk | null; // I am recording
  lostRaceTo: Speaker | null; // 08: someone else got the floor first while I was pressing
  level: number; // 0..1, mine while talking, the speaker's while listening
  notice: string | null; // transient line under the channel name
  micDenied: boolean;
}

const initialState: FloorState = {
  speaker: null,
  holding: false,
  myTalk: null,
  lostRaceTo: null,
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
      if (!action.payload) state.lostRaceTo = null;
    },
    startMyTalk(state, action: PayloadAction<MyTalk>) {
      state.myTalk = action.payload;
      state.lostRaceTo = null;
      state.notice = null;
    },
    setMyTalkMode(state, action: PayloadAction<TalkMode>) {
      if (state.myTalk) state.myTalk.mode = action.payload;
    },
    stopMyTalk(state) {
      state.myTalk = null;
      state.level = 0;
    },
    setSpeaker(state, action: PayloadAction<Speaker | null>) {
      state.speaker = action.payload;
      if (!action.payload && !state.myTalk) state.level = 0;
    },
    setLostRaceTo(state, action: PayloadAction<Speaker | null>) {
      state.lostRaceTo = action.payload;
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

export const {
  setHolding,
  startMyTalk,
  setMyTalkMode,
  stopMyTalk,
  setSpeaker,
  setLostRaceTo,
  setLevel,
  setNotice,
  setMicDenied,
} = floor.actions;
export default floor.reducer;
