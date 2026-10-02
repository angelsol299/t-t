import { describe, expect, it } from 'vitest';
import { decodeSample, encodeSample, resample } from '../../shared/mulaw.ts';
import { initialNetState, netReducer, type NetEvent, type NetState } from '../../shared/netMachine.ts';
import { decodeChunkFrame, encodeChunkFrame } from '../../shared/protocol.ts';

const run = (events: NetEvent[], state: NetState = initialNetState(0)) => events.reduce(netReducer, state);
const up = (at: number): NetEvent => ({ type: 'link_up', at });
const down = (at: number): NetEvent => ({ type: 'link_down', at });
const tick = (at: number): NetEvent => ({ type: 'tick', at });

describe('network state machine', () => {
  it('absorbs a 2s dropout: the state never leaves online', () => {
    const seen: string[] = [];
    let state = run([up(0)]);
    for (const event of [down(1000), tick(1500), tick(2500), up(3000), tick(3500)]) {
      state = netReducer(state, event);
      seen.push(state.net);
    }
    expect(new Set(seen)).toEqual(new Set(['online']));
  });

  it('goes offline after 3s down, with offlineSince at the moment the link dropped', () => {
    const state = run([up(0), down(1000), tick(3900), tick(4000)]);
    expect(state.net).toBe('offline');
    expect(state.offlineSince).toBe(1000);
  });

  it('shows recovering for 5s after coming back, then settles to online', () => {
    let state = run([up(0), down(1000), tick(4500), up(10_000)]);
    expect(state.net).toBe('recovering');
    state = netReducer(state, tick(14_000));
    expect(state.net).toBe('recovering');
    state = netReducer(state, tick(15_000));
    expect(state.net).toBe('online');
  });

  it('a cold start with no signal ends up offline instead of hanging', () => {
    const state = run([tick(1000), tick(3500)]);
    expect(state.net).toBe('offline');
  });

  it('high RTT means weak, and recovery needs a clearly good link (hysteresis)', () => {
    let state = run([up(0), { type: 'pong', at: 1, roundTripMs: 1200 }]);
    expect(state.net).toBe('weak');
    state = netReducer(state, { type: 'pong', at: 2, roundTripMs: 650 }); // in between: stay weak
    expect(state.net).toBe('weak');
    state = netReducer(state, { type: 'pong', at: 3, roundTripMs: 120 });
    expect(state.net).toBe('online');
  });

  it('two missed pongs or a live backlog over 1.5s means weak', () => {
    expect(run([up(0), { type: 'ping_missed', at: 1 }, { type: 'ping_missed', at: 2 }]).net).toBe('weak');
    expect(run([up(0), { type: 'backlog', at: 1, ms: 1750 }]).net).toBe('weak');
    expect(run([up(0), { type: 'backlog', at: 1, ms: 750 }]).net).toBe('online');
  });
});

describe('codec and framing', () => {
  it('µ-law round-trips within quantisation error', () => {
    for (const offset of [0, 100, -100, 1000, -1000, 12_000, -32_000]) {
      const back = decodeSample(encodeSample(offset));
      expect(Math.abs(back - offset)).toBeLessThanOrEqual(Math.max(8, Math.abs(offset) * 0.07));
    }
  });

  it('resamples 16kHz to 8kHz at half the length', () => {
    expect(resample(new Float32Array(1600), 16_000, 8000)).toHaveLength(800);
    expect(resample(new Float32Array(4410), 44_100, 8000)).toHaveLength(800);
  });

  it('chunk frames encode and decode', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const payload = new Uint8Array([1, 2, 3, 250]);
    const frame = decodeChunkFrame(encodeChunkFrame(id, 77, payload))!;
    expect(frame.clipId).toBe(id);
    expect(frame.seq).toBe(77);
    expect([...frame.payload]).toEqual([...payload]);
  });
});
