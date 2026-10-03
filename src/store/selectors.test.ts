import type { RootState } from '@/store';
import type { ChannelMessage } from '@shared/protocol';
import { describe, expect, it } from 'vitest';
import { selectNowPlaying, selectPushToTalkState, selectRows, selectSubtitle } from './selectors';
import connection from './slices/connection';
import floor from './slices/floor';
import messages from './slices/messages';
import outbox, { type OutboxEntry } from './slices/outbox';
import playback from './slices/playback';
import session from './slices/session';

const ME = 'me-client-id';
const INIT = { type: '@@init' };

/** A store state built from the real slice defaults, with the given parts replaced. */
function makeState(parts: { [K in keyof RootState]?: Partial<RootState[K]> } = {}): RootState {
  const defaults: RootState = {
    session: { ...session(undefined, INIT), clientId: ME, name: 'Me' },
    connection: { ...connection(undefined, INIT), everConnected: true, linkUp: true, online: 4 },
    floor: floor(undefined, INIT),
    playback: playback(undefined, INIT),
    outbox: outbox(undefined, INIT),
    messages: messages(undefined, INIT),
  };
  const state = { ...defaults } as Record<string, object>;
  for (const [key, value] of Object.entries(parts)) state[key] = { ...state[key], ...value };
  return state as unknown as RootState;
}

function message(overrides: Partial<ChannelMessage>): ChannelMessage {
  return {
    seq: 1,
    id: 'message-1',
    senderId: 'anna',
    senderName: 'Anna',
    durationMs: 3000,
    recordedAt: 1_000_000,
    committedAt: 1_000_500,
    heardBy: 0,
    ...overrides,
  };
}

function unsentClip(overrides: Partial<OutboxEntry>): OutboxEntry {
  return {
    clipId: 'clip-1',
    recordedAt: 2_000_000,
    status: 'queued',
    total: 8,
    durationMs: 2000,
    ackedUpTo: -1,
    attempts: 0,
    progress: 0.5,
    ...overrides,
  };
}

describe('selectPushToTalkState', () => {
  const talking = { clipId: 'clip-1', startedAt: 5000 };

  it('shows the mic-off button even while recording', () => {
    const state = makeState({ floor: { micDenied: true, myTalk: { ...talking, mode: 'live' } } });
    expect(selectPushToTalkState(state)).toEqual({ kind: 'micOff' });
  });

  it('live: counts everyone online except me as listeners', () => {
    const state = makeState({ floor: { myTalk: { ...talking, mode: 'live' }, level: 0.4 }, connection: { online: 4 } });
    expect(selectPushToTalkState(state)).toEqual({ kind: 'live', startedAt: 5000, listeners: 3, level: 0.4 });
  });

  it('local (record-and-send) says whether it waits for the network', () => {
    const state = makeState({ floor: { myTalk: { ...talking, mode: 'local' } }, connection: { net: 'offline' } });
    expect(selectPushToTalkState(state)).toMatchObject({ kind: 'local', offline: true });
  });

  it('pending while the floor request is in flight', () => {
    const state = makeState({ floor: { myTalk: { ...talking, mode: 'pending' } } });
    expect(selectPushToTalkState(state)).toEqual({ kind: 'pending' });
  });

  it('receiving: converts the speaker start time from server time to phone time', () => {
    const speaker = { clientId: 'anna', name: 'Anna', clipId: 'clip-a', startedAt: 10_000 };
    const state = makeState({ floor: { speaker }, session: { serverOffset: 2_000 } });
    expect(selectPushToTalkState(state)).toMatchObject({ kind: 'receiving', name: 'Anna', startedAt: 8_000 });
  });

  it('idle, online or offline', () => {
    expect(selectPushToTalkState(makeState())).toEqual({ kind: 'idle', offline: false });
    expect(selectPushToTalkState(makeState({ connection: { net: 'offline' } }))).toEqual({ kind: 'idle', offline: true });
  });

  it('returns the same object while its inputs are unchanged, so the button does not re-render', () => {
    const state = makeState({ floor: { myTalk: { ...talking, mode: 'live' } } });
    const unrelatedChange = { ...state, playback: { ...state.playback, queue: ['x'] } };
    expect(selectPushToTalkState(unrelatedChange)).toBe(selectPushToTalkState(state));
  });
});

describe('selectSubtitle', () => {
  it('says "Connecting…" until the first connection', () => {
    expect(selectSubtitle(makeState({ connection: { everConnected: false } }))).toBe('Connecting…');
  });

  it('shows the online count', () => {
    expect(selectSubtitle(makeState({ connection: { online: 6 } }))).toBe('6 online');
  });

  it('while live, shows how many people hear me', () => {
    const state = makeState({ floor: { myTalk: { clipId: 'c', startedAt: 0, mode: 'live' } }, connection: { online: 6 } });
    expect(selectSubtitle(state)).toBe('Live to 5');
  });

  it('offline beats live, and uses the count from when the signal was lost', () => {
    const state = makeState({
      floor: { myTalk: { clipId: 'c', startedAt: 0, mode: 'live' } },
      connection: { net: 'offline', online: 2, onlineAtDrop: 6 },
    });
    expect(selectSubtitle(state)).toBe('6 online when you lost signal');
  });

  it('a notice beats everything', () => {
    const state = makeState({ floor: { notice: 'Hold the button to talk' }, connection: { net: 'offline' } });
    expect(selectSubtitle(state)).toBe('Hold the button to talk');
  });
});

describe('selectRows', () => {
  it('someone else’s message shows the time; mine shows "Heard by N"', () => {
    const state = makeState({
      messages: { list: [message({ id: 'a' }), message({ id: 'b', seq: 2, senderId: ME, heardBy: 3 })] },
    });
    const [theirs, mine] = selectRows(state);
    expect(theirs).toMatchObject({ id: 'a', mine: false, name: 'Anna', receipt: { kind: 'time' } });
    expect(mine).toMatchObject({ id: 'b', mine: true, receipt: { kind: 'heard', heardBy: 3 } });
  });

  it('shows times in phone time and flags late and missed messages', () => {
    const late = message({ recordedAt: 1_000_000, committedAt: 1_000_000 + 31_000 });
    const state = makeState({
      messages: { list: [late] },
      playback: { missed: ['message-1'] },
      session: { serverOffset: 500 },
    });
    expect(selectRows(state)[0]).toMatchObject({ at: 999_500, late: true, missed: true });
  });

  it('puts my unsent clips at the bottom, oldest first, with the right receipt', () => {
    const state = makeState({
      messages: { list: [message({})] },
      outbox: {
        items: {
          newer: unsentClip({ clipId: 'newer', recordedAt: 3_000_000, status: 'failed' }),
          older: unsentClip({ clipId: 'older', recordedAt: 2_000_000 }),
        },
      },
    });
    const rows = selectRows(state);
    expect(rows.map((row) => row.id)).toEqual(['message-1', 'older', 'newer']);
    expect(rows[1]).toMatchObject({ mine: true, pending: true, receipt: { kind: 'sending', percent: null } });
    expect(rows[2].receipt).toEqual({ kind: 'failed' });
  });

  it('an unsent clip reads "Not sent yet" offline and "Sending N%" on a weak link', () => {
    const items = { clip: unsentClip({ clipId: 'clip', progress: 0.6 }) };
    expect(selectRows(makeState({ outbox: { items }, connection: { net: 'offline' } }))[0].receipt).toEqual({ kind: 'queued' });
    expect(selectRows(makeState({ outbox: { items }, connection: { net: 'weak' } }))[0].receipt).toEqual({
      kind: 'sending',
      percent: 60,
    });
  });

  it('leaves out a clip still being recorded, and one the server has already committed', () => {
    const state = makeState({
      messages: { list: [message({ id: 'committed', senderId: ME })] },
      outbox: {
        items: {
          recording: unsentClip({ clipId: 'recording', status: 'recording' }),
          committed: unsentClip({ clipId: 'committed' }),
        },
      },
    });
    expect(selectRows(state).map((row) => row.id)).toEqual(['committed']);
  });
});

describe('selectNowPlaying', () => {
  it('ignores position updates, so the message list does not re-render on every progress tick', () => {
    const current = { messageId: 'a', positionMs: 100, durationMs: 3000, playing: true };
    const before = makeState({ playback: { current, queue: ['b'] } });
    const after = makeState({ playback: { current: { ...current, positionMs: 200 }, queue: ['b'] } });
    expect(selectNowPlaying(after)).toBe(selectNowPlaying(before));
    expect(selectNowPlaying(before)).toEqual({ messageId: 'a', playing: true, durationMs: 3000, nextMessageId: 'b' });
  });

  it('there is no "next" while nothing is playing', () => {
    const state = makeState({ playback: { current: null, queue: ['b'] } });
    expect(selectNowPlaying(state).nextMessageId).toBeNull();
  });
});
