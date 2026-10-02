import type { AudioBufferQueueSourceNode } from 'react-native-audio-api';
import { CHUNK_MS } from '@shared/protocol';
import { audioContext, mulawBuffer } from './context';

// Plays someone else's live talk as chunks arrive. A short jitter buffer
// (JITTER_MS) is filled before playback starts so small network hiccups do
// not chop the audio.

const JITTER_MS = 300;

interface Stream {
  clipId: string;
  node: AudioBufferQueueSourceNode | null;
  waiting: Uint8Array[];
  seqs: Set<number>;
  firstAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

let current: Stream | null = null;
let muted = false;
// clipId → chunks heard live; used to decide whether a committed clip still
// needs to be played to this user (MISSED) or was heard in full already.
const heard = new Map<string, number>();

function startNode(s: Stream) {
  if (s.node || muted) return;
  const ctx = audioContext();
  const node = ctx.createBufferQueueSource();
  node.connect(ctx.destination);
  for (const b of s.waiting) node.enqueueBuffer(mulawBuffer(b));
  s.waiting = [];
  node.start(ctx.currentTime);
  s.node = node;
}

export const streamPlayer = {
  begin(clipId: string) {
    if (current?.clipId === clipId) return;
    streamPlayer.end();
    current = { clipId, node: null, waiting: [], seqs: new Set(), firstAt: 0, timer: null };
  },
  chunk(clipId: string, seq: number, bytes: Uint8Array) {
    if (!current || current.clipId !== clipId) streamPlayer.begin(clipId);
    const s = current!;
    if (s.seqs.has(seq)) return;
    s.seqs.add(seq);
    heard.set(clipId, s.seqs.size);
    if (s.node) {
      s.node.enqueueBuffer(mulawBuffer(bytes));
      return;
    }
    s.waiting.push(bytes);
    if (s.firstAt === 0) {
      s.firstAt = Date.now();
      s.timer = setTimeout(() => startNode(s), JITTER_MS);
    }
    if (s.waiting.length * CHUNK_MS >= JITTER_MS) startNode(s);
  },
  /** The speaker released: let what's queued play out. */
  end() {
    const s = current;
    current = null;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    if (!s.node && s.waiting.length > 0 && !muted) startNode(s);
  },
  /** Talking pre-empts listening (and vice versa there is no overlap). */
  setMuted(m: boolean) {
    muted = m;
    if (m && current?.node) {
      current.node.stop();
      current.node = null;
    }
  },
  heardChunks(clipId: string) {
    return heard.get(clipId) ?? 0;
  },
  forget(clipId: string) {
    heard.delete(clipId);
  },
};
