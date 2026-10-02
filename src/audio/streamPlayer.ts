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

function startNode(stream: Stream) {
  if (stream.node || muted) return;
  const context = audioContext();
  const node = context.createBufferQueueSource();
  node.connect(context.destination);
  for (const bytes of stream.waiting) node.enqueueBuffer(mulawBuffer(bytes));
  stream.waiting = [];
  // Offset must be explicit: the library defaults it to -1 and then rejects
  // its own default ("offset must be a finite non-negative number: -1").
  node.start(context.currentTime, 0);
  stream.node = node;
}

export const streamPlayer = {
  begin(clipId: string) {
    if (current?.clipId === clipId) return;
    streamPlayer.end();
    current = { clipId, node: null, waiting: [], seqs: new Set(), firstAt: 0, timer: null };
  },
  chunk(clipId: string, seq: number, bytes: Uint8Array) {
    if (!current || current.clipId !== clipId) streamPlayer.begin(clipId);
    const stream = current!;
    if (stream.seqs.has(seq)) return;
    stream.seqs.add(seq);
    heard.set(clipId, stream.seqs.size);
    if (stream.node) {
      stream.node.enqueueBuffer(mulawBuffer(bytes));
      return;
    }
    stream.waiting.push(bytes);
    if (stream.firstAt === 0) {
      stream.firstAt = Date.now();
      stream.timer = setTimeout(() => startNode(stream), JITTER_MS);
    }
    if (stream.waiting.length * CHUNK_MS >= JITTER_MS) startNode(stream);
  },
  /** The speaker released: let what's queued play out. */
  end() {
    const stream = current;
    current = null;
    if (!stream) return;
    if (stream.timer) clearTimeout(stream.timer);
    if (!stream.node && stream.waiting.length > 0 && !muted) startNode(stream);
  },
  /** Talking pre-empts listening (and vice versa there is no overlap). */
  setMuted(shouldMute: boolean) {
    muted = shouldMute;
    if (shouldMute && current?.node) {
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
