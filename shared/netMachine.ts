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
export const WEAK_RTT_MS = 800;
export const GOOD_RTT_MS = 500;
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
  rtt: number | null;
  missedPongs: number;
  backlogMs: number;
  poorQuality: boolean;
}

export type NetEvent =
  | { type: 'link_up'; at: number }
  | { type: 'link_down'; at: number }
  | { type: 'pong'; at: number; rtt: number }
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
    rtt: null,
    missedPongs: 0,
    backlogMs: 0,
    poorQuality: false,
  };
}

function nextQuality(s: NetState): boolean {
  const bad =
    (s.rtt !== null && s.rtt > WEAK_RTT_MS) ||
    s.missedPongs >= WEAK_MISSED_PONGS ||
    s.backlogMs > WEAK_BACKLOG_MS;
  const good =
    (s.rtt === null || s.rtt < GOOD_RTT_MS) && s.missedPongs === 0 && s.backlogMs < GOOD_BACKLOG_MS;
  if (bad) return true;
  if (good) return false;
  return s.poorQuality; // in the hysteresis band: keep what we had
}

function settled(s: NetState): Net {
  return s.poorQuality ? 'weak' : 'online';
}

export function netReducer(s: NetState, e: NetEvent): NetState {
  switch (e.type) {
    case 'link_up': {
      const next: NetState = { ...s, linkUp: true, everConnected: true, downSince: null, missedPongs: 0 };
      if (s.net === 'offline') {
        return { ...next, net: 'recovering', recoveringUntil: e.at + RECOVERING_MS };
      }
      return next;
    }
    case 'link_down': {
      if (!s.linkUp) return s;
      return { ...s, linkUp: false, downSince: e.at, rtt: null };
    }
    case 'pong': {
      const next = { ...s, rtt: e.rtt, missedPongs: 0 };
      next.poorQuality = nextQuality(next);
      return withSettled(next);
    }
    case 'ping_missed': {
      const next = { ...s, missedPongs: s.missedPongs + 1 };
      next.poorQuality = nextQuality(next);
      return withSettled(next);
    }
    case 'backlog': {
      const next = { ...s, backlogMs: e.ms };
      next.poorQuality = nextQuality(next);
      return withSettled(next);
    }
    case 'tick': {
      if (!s.linkUp && s.downSince !== null && s.net !== 'offline' && e.at - s.downSince >= ABSORB_MS) {
        return { ...s, net: 'offline', offlineSince: s.downSince, recoveringUntil: null };
      }
      if (s.net === 'recovering' && s.recoveringUntil !== null && e.at >= s.recoveringUntil) {
        return { ...s, net: settled(s), recoveringUntil: null, offlineSince: null };
      }
      return s;
    }
  }
}

// Quality changes only move between online and weak while the link is up;
// offline and recovering are driven by link events and ticks.
function withSettled(s: NetState): NetState {
  if (!s.linkUp) return s;
  if (s.net === 'online' || s.net === 'weak') return { ...s, net: settled(s) };
  return s;
}
