import { SERVER_URL } from '@/config';
import type { AppDispatch, RootState } from '@/store';
import { outboxActions, type OutboxEntry } from '@/store/slices/outbox';
import type { ChannelMessage, ClipComplete } from '@shared/protocol';
import { outboxStore, type OutboxItem } from './db';
import { clipFiles } from './files';

// The upload engine. Every clip I record goes through here, live or not:
//  1. ask the server which chunks it already has (live acks, earlier attempts)
//  2. PUT the missing ones (idempotent, so retries and duplicates are harmless)
//  3. POST complete; the server commits exactly once per clip id
// Network errors retry forever with backoff. Only errors that retrying cannot
// fix (server rejects the clip, local audio unreadable) surface as "Not sent".

const RETRY = [2000, 4000, 8000, 15000, 30000];
const TIMEOUT_MS = 10_000;

class Permanent extends Error {}

interface OutboxDependencies {
  dispatch: AppDispatch;
  getState: () => RootState;
  onCommitted: (message: ChannelMessage) => void;
}

export function createOutbox({ dispatch, getState, onCommitted }: OutboxDependencies) {
  let running = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const deleted = new Set<string>();

  const items = () => Object.values(getState().outbox.items).sort((first, second) => first.recordedAt - second.recordedAt);

  function save(item: OutboxItem, progress = 0) {
    outboxStore.put(item);
    dispatch(outboxActions.upsert({ ...item, progress }));
  }
  function patch(clipId: string, changes: Partial<OutboxEntry>) {
    const currentPlayback = getState().outbox.items[clipId];
    if (!currentPlayback) return;
    const next = { ...currentPlayback, ...changes };
    const { progress: _ignored, ...persisted } = next;
    outboxStore.put(persisted);
    dispatch(outboxActions.patch({ clipId, ...changes }));
  }
  function drop(clipId: string) {
    outboxStore.remove(clipId);
    clipFiles.remove(clipId);
    dispatch(outboxActions.remove(clipId));
  }

  async function request(path: string, init: RequestInit = {}) {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), TIMEOUT_MS);
    const session = getState().session;
    try {
      return await fetch(`${SERVER_URL}${path}`, {
        ...init,
        signal: abortController.signal,
        headers: {
          ...(init.headers ?? {}),
          'x-client-id': session.clientId,
          'x-client-name': encodeURIComponent(session.name ?? 'Unknown'),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function upload(item: OutboxEntry) {
    const total = item.total!;
    const response = await request(`/clips/${item.clipId}`);
    if (!response.ok) throw response.status >= 500 ? new Error(`status ${response.status}`) : new Permanent(`status ${response.status}`);
    const { received } = (await response.json()) as { received: number[] };
    const receivedChunks = new Set(received);
    patch(item.clipId, { status: 'sending', progress: receivedChunks.size / total });

    for (let seq = 0; seq < total; seq++) {
      if (receivedChunks.has(seq)) continue;
      if (deleted.has(item.clipId)) return;
      const bytes = clipFiles.readChunk(item.clipId, seq);
      if (!bytes) throw new Permanent('recording unreadable');
      const put = await request(`/clips/${item.clipId}/chunks/${seq}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      });
      if (!put.ok) throw put.status >= 500 ? new Error(`status ${put.status}`) : new Permanent(`status ${put.status}`);
      receivedChunks.add(seq);
      patch(item.clipId, { progress: receivedChunks.size / total, ackedUpTo: Math.max(item.ackedUpTo, seq) });
    }

    const body: ClipComplete = { total, durationMs: item.durationMs, recordedAt: item.recordedAt };
    const done = await request(`/clips/${item.clipId}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (done.status === 409) throw new Error('chunks missing on server'); // retry resumes
    if (!done.ok) throw done.status >= 500 ? new Error(`status ${done.status}`) : new Permanent(`status ${done.status}`);
    const { message } = (await done.json()) as { message: ChannelMessage };
    onCommitted(message);
  }

  function scheduleRetry(attempts: number) {
    if (retryTimer) return;
    const delay = RETRY[Math.min(attempts - 1, RETRY.length - 1)];
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flushOutbox();
    }, delay);
  }

  async function flushOutbox() {
    if (running) return;
    running = true;
    try {
      for (const item of items()) {
        if (item.status !== 'queued' && item.status !== 'sending') continue;
        if (item.total === null) continue;
        try {
          await upload(item);
        } catch (error) {
          if (deleted.has(item.clipId)) continue;
          if (error instanceof Permanent) {
            patch(item.clipId, { status: 'failed', error: error.message });
            continue;
          }
          const attempts = item.attempts + 1;
          patch(item.clipId, { status: 'queued', attempts });
          scheduleRetry(attempts);
          break; // the link is bad; stop hammering and wait for the retry
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    /** On launch: restore the queue. A clip cut off by an app kill is still sent. */
    restore() {
      for (const item of outboxStore.load()) {
        if (item.status === 'recording') {
          const seqs = clipFiles.chunks(item.clipId);
          let total = 0;
          while (seqs[total] === total) total++;
          if (total === 0) {
            drop(item.clipId);
            continue;
          }
          save({ ...item, status: 'queued', total, durationMs: total * 250, cutShort: true });
        } else {
          save(item.status === 'sending' ? { ...item, status: 'queued' } : item);
        }
      }
    },
    begin(clipId: string, recordedAt: number) {
      save({ clipId, recordedAt, status: 'recording', total: null, durationMs: 0, ackedUpTo: -1, attempts: 0 });
    },
    finish(clipId: string, total: number, durationMs: number) {
      patch(clipId, { status: 'queued', total, durationMs });
    },
    acked(clipId: string, upTo: number) {
      const currentPlayback = getState().outbox.items[clipId];
      if (currentPlayback && upTo > currentPlayback.ackedUpTo) {
        dispatch(outboxActions.patch({ clipId, ackedUpTo: upTo, progress: currentPlayback.total ? (upTo + 1) / currentPlayback.total : 0 }));
      }
    },
    /** The server committed it (via the live path or an upload). */
    committed(clipId: string) {
      if (getState().outbox.items[clipId]) drop(clipId);
    },
    discard(clipId: string) {
      deleted.add(clipId);
      drop(clipId);
    },
    retry(clipId: string) {
      patch(clipId, { status: 'queued', attempts: 0, error: undefined });
      void flushOutbox();
    },
    kick: flushOutbox,
    /** Link came back: retry now instead of waiting out the backoff. */
    kickNow() {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      void flushOutbox();
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
