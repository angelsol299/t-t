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
    setHolding(s, a: PayloadAction<boolean>) {
      s.holding = a.payload;
      if (!a.payload) s.denied = null;
    },
    startMine(s, a: PayloadAction<{ clipId: string; startedAt: number; mode: TalkMode }>) {
      s.my = a.payload;
      s.denied = null;
      s.notice = null;
    },
    setMyMode(s, a: PayloadAction<TalkMode>) {
      if (s.my) s.my.mode = a.payload;
    },
    stopMine(s) {
      s.my = null;
      s.level = 0;
    },
    setSpeaker(s, a: PayloadAction<Speaker | null>) {
      s.speaker = a.payload;
      if (!a.payload && !s.my) s.level = 0;
    },
    setDenied(s, a: PayloadAction<Speaker | null>) {
      s.denied = a.payload;
    },
    setLevel(s, a: PayloadAction<number>) {
      s.level = a.payload;
    },
    setNotice(s, a: PayloadAction<string | null>) {
      s.notice = a.payload;
    },
    setMicDenied(s, a: PayloadAction<boolean>) {
      s.micDenied = a.payload;
    },
  },
});

export const { setHolding, startMine, setMyMode, stopMine, setSpeaker, setDenied, setLevel, setNotice, setMicDenied } =
  floor.actions;
export default floor.reducer;
