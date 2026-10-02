import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import type { ChannelMessage } from '../../shared/protocol.ts';

export type Db = ReturnType<typeof openDb>;

interface MessageRow {
  seq: number;
  id: string;
  sender_id: string;
  sender_name: string;
  duration_ms: number;
  recorded_at: number;
  committed_at: number;
  heard_by: number;
}

const SELECT = `
  SELECT m.*, (SELECT COUNT(*) FROM receipts r WHERE r.msg_id = m.id) AS heard_by
  FROM messages m`;

function toMessage(r: MessageRow): ChannelMessage {
  return {
    seq: r.seq,
    id: r.id,
    senderId: r.sender_id,
    senderName: r.sender_name,
    durationMs: r.duration_ms,
    recordedAt: r.recorded_at,
    committedAt: r.committed_at,
    heardBy: r.heard_by,
  };
}

export function openDb(dataDir: string) {
  const db = new DatabaseSync(path.join(dataDir, 'teton.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS messages (
      seq          INTEGER PRIMARY KEY AUTOINCREMENT,
      id           TEXT NOT NULL UNIQUE,
      sender_id    TEXT NOT NULL,
      sender_name  TEXT NOT NULL,
      duration_ms  INTEGER NOT NULL,
      recorded_at  INTEGER NOT NULL,
      committed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipts (
      msg_id    TEXT NOT NULL,
      client_id TEXT NOT NULL,
      PRIMARY KEY (msg_id, client_id)
    );
  `);

  const insertMsg = db.prepare(
    `INSERT OR IGNORE INTO messages (id, sender_id, sender_name, duration_ms, recorded_at, committed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const byId = db.prepare(`${SELECT} WHERE m.id = ?`);
  const since = db.prepare(`${SELECT} WHERE m.seq > ? ORDER BY m.seq ASC LIMIT ?`);
  const recent = db.prepare(`${SELECT} WHERE m.committed_at > ? ORDER BY m.seq ASC LIMIT ?`);
  const insertReceipt = db.prepare(
    `INSERT OR IGNORE INTO receipts (msg_id, client_id)
     SELECT id, ? FROM messages WHERE id = ? AND sender_id != ?`,
  );
  const heardBy = db.prepare(`SELECT COUNT(*) AS n FROM receipts WHERE msg_id = ?`);
  const expired = db.prepare(`SELECT id FROM messages WHERE committed_at < ?`);
  const deleteMsg = db.prepare(`DELETE FROM messages WHERE id = ?`);
  const deleteReceipts = db.prepare(`DELETE FROM receipts WHERE msg_id = ?`);

  return {
    /** Inserts once; a second commit of the same clip id returns the existing row. */
    commit(m: Omit<ChannelMessage, 'seq' | 'heardBy'>): { message: ChannelMessage; created: boolean } {
      const res = insertMsg.run(m.id, m.senderId, m.senderName, m.durationMs, m.recordedAt, m.committedAt);
      const row = byId.get(m.id) as unknown as MessageRow;
      return { message: toMessage(row), created: res.changes > 0 };
    },
    get(id: string): ChannelMessage | null {
      const row = byId.get(id) as unknown as MessageRow | undefined;
      return row ? toMessage(row) : null;
    },
    since(seq: number, limit = 200): ChannelMessage[] {
      return (since.all(seq, limit) as unknown as MessageRow[]).map(toMessage);
    },
    recent(sinceMs: number, limit = 200): ChannelMessage[] {
      return (recent.all(sinceMs, limit) as unknown as MessageRow[]).map(toMessage);
    },
    /** Returns the new heard-by count, or null if nothing changed. */
    markHeard(msgId: string, clientId: string): number | null {
      const res = insertReceipt.run(clientId, msgId, clientId);
      if (res.changes === 0) return null;
      return (heardBy.get(msgId) as { n: number }).n;
    },
    expiredIds(beforeMs: number): string[] {
      return (expired.all(beforeMs) as { id: string }[]).map((r) => r.id);
    },
    delete(id: string) {
      deleteReceipts.run(id);
      deleteMsg.run(id);
    },
    close() {
      db.close();
    },
  };
}
