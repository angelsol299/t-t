// Pure network state machine: online | weak | offline | recovering.
//
// Inputs are low-level facts (socket opened/closed, pong RTTs, missed pongs,
// unacknowledged audio backlog, clock ticks). The output is the user-facing
// state. Rules:
//  - Link drops shorter than ABSORB_MS are absorbed: the state does not change,
//    so the status band never flickers on a blip.
//  - After ABSORB_MS down we go offline; offlineSince is when the link dropped.
//  - Coming back from offline shows `recovering` for RECOVERING_MS, then settles.
//  - Weak/online use hysteresis so a borderline link does not flap.

export type Net = 'online' | 'weak' | 'offline' | 'recovering';

export const ABSORB_MS = 3000;
export const RECOVERING_MS = 5000;
export const WEAK_ROUND_TRIP_MS = 800;
export const GOOD_ROUND_TRIP_MS = 500;
export const WEAK_BACKLOG_MS = 1500;
export const GOOD_BACKLOG_MS = 500;
export const WEAK_MISSED_PONGS = 2;

export interface NetState {
  net: Net;
  linkUp: boolean;
  everConnected: boolean;
  downSince: number | null;
  offlineSince: number | null;
  recoveringUntil: number | null;
  roundTripMs: number | null;
  missedPongs: number;
  backlogMs: number;
  poorQuality: boolean;
}

export type NetEvent =
  | { type: 'link_up'; at: number }
  | { type: 'link_down'; at: number }
  | { type: 'pong'; at: number; roundTripMs: number }
  | { type: 'ping_missed'; at: number }
  | { type: 'backlog'; at: number; ms: number }
  | { type: 'tick'; at: number };

export function initialNetState(at: number): NetState {
  // A cold start counts as "down since launch" so an app opened with no
  // signal shows offline after the absorb window instead of hanging.
  return {
    net: 'online',
    linkUp: false,
    everConnected: false,
    downSince: at,
    offlineSince: null,
    recoveringUntil: null,
    roundTripMs: null,
    missedPongs: 0,
    backlogMs: 0,
    poorQuality: false,
  };
}

function nextQuality(state: NetState): boolean {
  const bad =
    (state.roundTripMs !== null && state.roundTripMs > WEAK_ROUND_TRIP_MS) ||
    state.missedPongs >= WEAK_MISSED_PONGS ||
    state.backlogMs > WEAK_BACKLOG_MS;
  const good =
    (state.roundTripMs === null || state.roundTripMs < GOOD_ROUND_TRIP_MS) && state.missedPongs === 0 && state.backlogMs < GOOD_BACKLOG_MS;
  if (bad) return true;
  if (good) return false;
  return state.poorQuality; // in the hysteresis band: keep what we had
}

function settled(state: NetState): Net {
  return state.poorQuality ? 'weak' : 'online';
}

export function netReducer(state: NetState, event: NetEvent): NetState {
  switch (event.type) {
    case 'link_up': {
      const next: NetState = { ...state, linkUp: true, everConnected: true, downSince: null, missedPongs: 0 };
      if (state.net === 'offline') {
        return { ...next, net: 'recovering', recoveringUntil: event.at + RECOVERING_MS };
      }
      return next;
    }
    case 'link_down': {
      if (!state.linkUp) return state;
      return { ...state, linkUp: false, downSince: event.at, roundTripMs: null };
    }
    case 'pong': {
      const next = { ...state, roundTripMs: event.roundTripMs, missedPongs: 0 };
      next.poorQuality = nextQuality(next);
      return withSettled(next);
    }
    case 'ping_missed': {
      const next = { ...state, missedPongs: state.missedPongs + 1 };
      next.poorQuality = nextQuality(next);
      return withSettled(next);
    }
    case 'backlog': {
      const next = { ...state, backlogMs: event.ms };
      next.poorQuality = nextQuality(next);
      return withSettled(next);
    }
    case 'tick': {
      if (!state.linkUp && state.downSince !== null && state.net !== 'offline' && event.at - state.downSince >= ABSORB_MS) {
        return { ...state, net: 'offline', offlineSince: state.downSince, recoveringUntil: null };
      }
      if (state.net === 'recovering' && state.recoveringUntil !== null && event.at >= state.recoveringUntil) {
        return { ...state, net: settled(state), recoveringUntil: null, offlineSince: null };
      }
      return state;
    }
  }
}

// Quality changes only move between online and weak while the link is up;
// offline and recovering are driven by link events and ticks.
function withSettled(state: NetState): NetState {
  if (!state.linkUp) return state;
  if (state.net === 'online' || state.net === 'weak') return { ...state, net: settled(state) };
  return state;
}
