import { openDatabaseSync } from 'expo-sqlite';
import type { ChannelMessage } from '@shared/protocol';

// Local persistence. Everything that must survive an app kill lives here:
// identity, the message cache, and the outbox of clips not yet on the server.

export type OutboxStatus = 'recording' | 'queued' | 'sending' | 'failed';

export interface OutboxItem {
  clipId: string;
  recordedAt: number; // server clock
  status: OutboxStatus;
  total: number | null; // chunk count, known once recording stops
  durationMs: number;
  ackedUpTo: number; // highest contiguous chunk the server confirmed
  attempts: number;
  error?: string;
  cutShort?: boolean; // app died mid-recording; what we have is still sent
}

const db = openDatabaseSync('teton.db');

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY NOT NULL, seq INTEGER NOT NULL, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL);
`);

export const kv = {
  get<T>(key: string, fallback: T): T {
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    db.runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
  },
};

export const messageCache = {
  load(): ChannelMessage[] {
    return db
      .getAllSync<{ json: string }>('SELECT json FROM messages ORDER BY seq ASC')
      .map((row) => JSON.parse(row.json) as ChannelMessage);
  },
  upsert(list: ChannelMessage[]) {
    if (list.length === 0) return;
    db.withTransactionSync(() => {
      for (const message of list) {
        db.runSync('INSERT OR REPLACE INTO messages (id, seq, json) VALUES (?, ?, ?)', message.id, message.seq, JSON.stringify(message));
      }
    });
  },
  /** Keep the cache to the current shift. */
  prune(beforeMs: number) {
    const keep = messageCache.load().filter((message) => message.committedAt >= beforeMs);
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM messages');
      for (const message of keep) {
        db.runSync('INSERT INTO messages (id, seq, json) VALUES (?, ?, ?)', message.id, message.seq, JSON.stringify(message));
      }
    });
  },
};

export const outboxStore = {
  load(): OutboxItem[] {
    return db.getAllSync<{ json: string }>('SELECT json FROM outbox').map((row) => JSON.parse(row.json) as OutboxItem);
  },
  put(item: OutboxItem) {
    db.runSync('INSERT OR REPLACE INTO outbox (id, json) VALUES (?, ?)', item.clipId, JSON.stringify(item));
  },
  remove(clipId: string) {
    db.runSync('DELETE FROM outbox WHERE id = ?', clipId);
  },
};
