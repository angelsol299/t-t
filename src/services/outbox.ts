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

interface Deps {
  dispatch: AppDispatch;
  getState: () => RootState;
  onCommitted: (m: ChannelMessage) => void;
}

export function createOutbox({ dispatch, getState, onCommitted }: Deps) {
  let running = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const deleted = new Set<string>();

  const items = () => Object.values(getState().outbox.items).sort((a, b) => a.recordedAt - b.recordedAt);

  function save(item: OutboxItem, progress = 0) {
    outboxStore.put(item);
    dispatch(outboxActions.upsert({ ...item, progress }));
  }
  function patch(clipId: string, p: Partial<OutboxEntry>) {
    const cur = getState().outbox.items[clipId];
    if (!cur) return;
    const next = { ...cur, ...p };
    const { progress: _ignored, ...persisted } = next;
    outboxStore.put(persisted);
    dispatch(outboxActions.patch({ clipId, ...p }));
  }
  function drop(clipId: string) {
    outboxStore.remove(clipId);
    clipFiles.remove(clipId);
    dispatch(outboxActions.remove(clipId));
  }

  async function request(path: string, init: RequestInit = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const s = getState().session;
    try {
      return await fetch(`${SERVER_URL}${path}`, {
        ...init,
        signal: ctl.signal,
        headers: {
          ...(init.headers ?? {}),
          'x-client-id': s.clientId,
          'x-client-name': encodeURIComponent(s.name ?? 'Unknown'),
        },
      });
    } finally {
      clearTimeout(t);
    }
  }

  async function upload(item: OutboxEntry) {
    const total = item.total!;
    const res = await request(`/clips/${item.clipId}`);
    if (!res.ok) throw res.status >= 500 ? new Error(`status ${res.status}`) : new Permanent(`status ${res.status}`);
    const { received } = (await res.json()) as { received: number[] };
    const have = new Set(received);
    patch(item.clipId, { status: 'sending', progress: have.size / total });

    for (let seq = 0; seq < total; seq++) {
      if (have.has(seq)) continue;
      if (deleted.has(item.clipId)) return;
      const bytes = clipFiles.readChunk(item.clipId, seq);
      if (!bytes) throw new Permanent('recording unreadable');
      const put = await request(`/clips/${item.clipId}/chunks/${seq}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      });
      if (!put.ok) throw put.status >= 500 ? new Error(`status ${put.status}`) : new Permanent(`status ${put.status}`);
      have.add(seq);
      patch(item.clipId, { progress: have.size / total, ackedUpTo: Math.max(item.ackedUpTo, seq) });
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
      void kick();
    }, delay);
  }

  async function kick() {
    if (running) return;
    running = true;
    try {
      for (const item of items()) {
        if (item.status !== 'queued' && item.status !== 'sending') continue;
        if (item.total === null) continue;
        try {
          await upload(item);
        } catch (err) {
          if (deleted.has(item.clipId)) continue;
          if (err instanceof Permanent) {
            patch(item.clipId, { status: 'failed', error: err.message });
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
      const cur = getState().outbox.items[clipId];
      if (cur && upTo > cur.ackedUpTo) {
        dispatch(outboxActions.patch({ clipId, ackedUpTo: upTo, progress: cur.total ? (upTo + 1) / cur.total : 0 }));
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
      void kick();
    },
    kick,
    /** Link came back: retry now instead of waiting out the backoff. */
    kickNow() {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      void kick();
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
