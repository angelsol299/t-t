import connection from '@/store/slices/connection';
import floor from '@/store/slices/floor';
import messages from '@/store/slices/messages';
import outbox from '@/store/slices/outbox';
import playback from '@/store/slices/playback';
import session from '@/store/slices/session';
import { decodeChunkFrame, type ClientMessage } from '@shared/protocol';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Outbox } from './outbox';
import type { Playback } from './playback';
import type { Socket } from './socket';
import { createTalk } from './talk';

// The talk flow with the native parts faked: a mic we feed chunk by chunk,
// in-memory chunk files, and a socket that records what would have been sent.
// The Redux slices and talk.ts itself are real.

const fakes = vi.hoisted(() => ({
  mic: { onChunk: null as ((chunkIndex: number, bytes: Uint8Array) => void) | null, chunks: 0, opens: true },
  files: new Map<string, Uint8Array>(),
}));

vi.mock('@/audio/recorder', () => ({
  startRecording: vi.fn(async (handlers: { onChunk: (chunkIndex: number, bytes: Uint8Array) => void }) => {
    fakes.mic.onChunk = handlers.onChunk;
    return fakes.mic.opens;
  }),
  stopRecording: vi.fn(async () => ({ total: fakes.mic.chunks, durationMs: fakes.mic.chunks * 250 })),
}));
vi.mock('@/audio/streamPlayer', () => ({ streamPlayer: { setMuted: vi.fn() } }));
vi.mock('@/audio/tone', () => ({ goLiveTone: vi.fn() }));
vi.mock('./haptics', () => ({ buzz: vi.fn() }));
vi.mock('expo-crypto', async () => ({ randomUUID: (await import('node:crypto')).randomUUID }));
vi.mock('./files', () => ({
  clipFiles: {
    writeChunk: (clipId: string, chunkIndex: number, bytes: Uint8Array) => fakes.files.set(`${clipId}/${chunkIndex}`, bytes),
    readChunk: (clipId: string, chunkIndex: number) => fakes.files.get(`${clipId}/${chunkIndex}`) ?? null,
  },
}));

/** The mic delivers `count` more 250ms chunks. */
function speak(count: number) {
  for (let index = 0; index < count; index++) fakes.mic.onChunk!(fakes.mic.chunks++, new Uint8Array(2000));
}

function setup({ network = 'online' }: { network?: 'online' | 'weak' | 'offline' } = {}) {
  const init = { type: '@@init' };
  const store = configureStore({
    reducer: { session, connection, floor, playback, outbox, messages },
    preloadedState: { connection: { ...connection(undefined, init), net: network, linkUp: network !== 'offline' } },
  });
  const sent: ClientMessage[] = [];
  const sentLiveChunks: number[] = [];
  const socket = {
    isUp: network !== 'offline',
    send: (message: ClientMessage) => sent.push(message) > 0,
    sendBinary: (frame: Uint8Array) => sentLiveChunks.push(decodeChunkFrame(frame)!.seq) > 0,
  } as unknown as Socket;
  const outboxSpy = { begin: vi.fn(), finish: vi.fn(), discard: vi.fn(), flush: vi.fn(async () => {}) };
  const playbackSpy = { pauseForTalk: vi.fn(), resumeAfterTalk: vi.fn() };
  const showNotice = vi.fn();
  const talk = createTalk({
    store,
    socket,
    outbox: outboxSpy as unknown as Outbox,
    playback: playbackSpy as unknown as Playback,
    showNotice,
  });
  const myTalk = () => store.getState().floor.myTalk;
  const floorReleases = () => sent.filter((message) => message.type === 'floor_release');
  return { talk, store, sent, sentLiveChunks, outbox: outboxSpy, playback: playbackSpy, showNotice, myTalk, floorReleases };
}

beforeEach(() => {
  vi.useFakeTimers();
  fakes.mic.onChunk = null;
  fakes.mic.chunks = 0;
  fakes.mic.opens = true;
  fakes.files.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('talk: good link', () => {
  it('asks for the floor and starts recording straight away, pausing any playback', async () => {
    const { talk, sent, myTalk, outbox, playback } = setup();
    await talk.begin();
    expect(myTalk()?.mode).toBe('pending');
    expect(sent).toEqual([expect.objectContaining({ type: 'floor_request', clipId: myTalk()!.clipId })]);
    expect(outbox.begin).toHaveBeenCalledWith(myTalk()!.clipId, expect.any(Number));
    expect(playback.pauseForTalk).toHaveBeenCalled();
  });

  it('once granted, streams what was recorded while waiting, then each new chunk', async () => {
    const { talk, myTalk, sentLiveChunks } = setup();
    await talk.begin();
    speak(2); // recorded while the floor request is in flight: on disk, not sent
    expect(sentLiveChunks).toEqual([]);

    talk.onFloorGranted(myTalk()!.clipId);
    expect(myTalk()?.mode).toBe('live');
    expect(sentLiveChunks).toEqual([0, 1]);

    speak(1);
    expect(sentLiveChunks).toEqual([0, 1, 2]);
  });

  it('on release, sends the clip details so the server can commit, then checks the outbox after a moment', async () => {
    const { talk, myTalk, floorReleases, outbox } = setup();
    await talk.begin();
    const clipId = myTalk()!.clipId;
    talk.onFloorGranted(clipId);
    speak(4);
    await talk.end();

    expect(outbox.finish).toHaveBeenCalledWith(clipId, 4, 1000);
    expect(floorReleases()).toEqual([expect.objectContaining({ clipId, total: 4, durationMs: 1000 })]);
    expect(outbox.flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(outbox.flush).toHaveBeenCalled();
    expect(myTalk()).toBeNull();
  });
});

describe('talk: the server does not answer, or answers too late', () => {
  it('falls back to record-and-send after 1 second without an answer', async () => {
    const { talk, myTalk } = setup();
    await talk.begin();
    vi.advanceTimersByTime(999);
    expect(myTalk()?.mode).toBe('pending');
    vi.advanceTimersByTime(1);
    expect(myTalk()?.mode).toBe('local');
  });

  it('ignores a grant that arrives after the fallback: nothing is streamed', async () => {
    const { talk, myTalk, sentLiveChunks } = setup();
    await talk.begin();
    vi.advanceTimersByTime(1000);
    talk.onFloorGranted(myTalk()!.clipId);
    speak(3);
    expect(myTalk()?.mode).toBe('local');
    expect(sentLiveChunks).toEqual([]);
  });

  it('a record-and-send clip goes to the outbox whole, uploaded right away', async () => {
    const { talk, myTalk, outbox, floorReleases } = setup();
    await talk.begin();
    const clipId = myTalk()!.clipId;
    vi.advanceTimersByTime(1000);
    speak(8);
    await talk.end();
    expect(outbox.finish).toHaveBeenCalledWith(clipId, 8, 2000);
    expect(outbox.flush).toHaveBeenCalled();
    expect(floorReleases()).toEqual([]);
  });
});

describe('talk: losing the race and accidental taps', () => {
  it('lost race: the recording is thrown away and the floor request withdrawn', async () => {
    const { talk, myTalk, outbox, floorReleases } = setup();
    await talk.begin();
    const clipId = myTalk()!.clipId;
    speak(2);
    await talk.discard();
    expect(outbox.discard).toHaveBeenCalledWith(clipId);
    expect(outbox.finish).not.toHaveBeenCalled();
    expect(floorReleases()).toEqual([expect.objectContaining({ clipId, total: 0 })]);
    expect(myTalk()).toBeNull();
  });

  it('a hold shorter than 300ms is discarded with a hint, not sent', async () => {
    const { talk, myTalk, outbox, showNotice, floorReleases } = setup();
    await talk.begin();
    const clipId = myTalk()!.clipId;
    speak(1); // 250ms
    await talk.end();
    expect(outbox.discard).toHaveBeenCalledWith(clipId);
    expect(outbox.finish).not.toHaveBeenCalled();
    expect(floorReleases()).toEqual([expect.objectContaining({ clipId, total: 0 })]);
    expect(showNotice).toHaveBeenCalledWith('Hold the button to talk', 2500);
  });
});

describe('talk: no signal and failures', () => {
  it('offline: records locally without asking for the floor', async () => {
    const { talk, myTalk, sent } = setup({ network: 'offline' });
    await talk.begin();
    speak(4);
    expect(myTalk()?.mode).toBe('local');
    expect(sent).toEqual([]);
  });

  it('a weak link also records locally instead of streaming', async () => {
    const { talk, myTalk, sent } = setup({ network: 'weak' });
    await talk.begin();
    expect(myTalk()?.mode).toBe('local');
    expect(sent).toEqual([]);
  });

  it('stops at 60 seconds even if the finger is still down', async () => {
    const { talk, myTalk, outbox } = setup();
    await talk.begin();
    speak(10);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(myTalk()).toBeNull();
    expect(outbox.finish).toHaveBeenCalled();
  });

  it('if the mic cannot open, nothing is kept and the user is told', async () => {
    fakes.mic.opens = false;
    const { talk, myTalk, outbox, showNotice } = setup();
    await talk.begin();
    expect(myTalk()).toBeNull();
    expect(outbox.discard).toHaveBeenCalled();
    expect(showNotice).toHaveBeenCalledWith('Could not open the microphone');
  });
});
