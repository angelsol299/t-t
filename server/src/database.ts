import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChannelMessage } from '../../shared/protocol.ts';

// The SQLite database: one row per committed message, and one row per
// "this person has heard that message" receipt.
//
// `seq` is the message's sequence number: 1, 2, 3… in the order messages were
// committed. Clients remember the last one they saw to catch up after being away.

const PAGE_SIZE = 200;

interface MessageRow {
  seq: number;
  id: string;
  sender_id: string;
  sender_name: string;
  duration_milliseconds: number;
  recorded_at: number;
  committed_at: number;
  heard_by: number;
}

// Every message query also counts its receipts ("Heard by N").
const SELECT_MESSAGES_WITH_RECEIPT_COUNT = `
  SELECT messages.*,
         (SELECT COUNT(*) FROM receipts WHERE receipts.message_id = messages.id) AS heard_by
  FROM messages`;

function toMessage(row: MessageRow): ChannelMessage {
  return {
    seq: row.seq,
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    durationMs: row.duration_milliseconds,
    recordedAt: row.recorded_at,
    committedAt: row.committed_at,
    heardBy: row.heard_by,
  };
}

export function openDatabase(dataDirectory: string) {
  const database = new DatabaseSync(path.join(dataDirectory, 'teton.db'));

  // Write-ahead logging: reads don't wait for writes.
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      seq                   INTEGER PRIMARY KEY AUTOINCREMENT,
      id                    TEXT NOT NULL UNIQUE,
      sender_id             TEXT NOT NULL,
      sender_name           TEXT NOT NULL,
      duration_milliseconds INTEGER NOT NULL,
      recorded_at           INTEGER NOT NULL,
      committed_at          INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipts (
      message_id TEXT NOT NULL,
      client_id  TEXT NOT NULL,
      PRIMARY KEY (message_id, client_id)
    );
  `);

  const insertMessage = database.prepare(`
    INSERT OR IGNORE INTO messages (id, sender_id, sender_name, duration_milliseconds, recorded_at, committed_at)
    VALUES (:id, :senderId, :senderName, :durationMilliseconds, :recordedAt, :committedAt)`);
  const selectMessageById = database.prepare(`${SELECT_MESSAGES_WITH_RECEIPT_COUNT} WHERE messages.id = :messageId`);
  const selectMessagesAfterSeq = database.prepare(
    `${SELECT_MESSAGES_WITH_RECEIPT_COUNT} WHERE messages.seq > :afterSeq ORDER BY messages.seq ASC LIMIT :limit`,
  );
  const selectMessagesCommittedAfter = database.prepare(
    `${SELECT_MESSAGES_WITH_RECEIPT_COUNT} WHERE messages.committed_at > :afterTimestamp ORDER BY messages.seq ASC LIMIT :limit`,
  );
  // Only adds the receipt if the message exists and the listener isn't its sender.
  const insertReceipt = database.prepare(`
    INSERT OR IGNORE INTO receipts (message_id, client_id)
    SELECT id, :clientId FROM messages WHERE id = :messageId AND sender_id != :clientId`);
  const countReceipts = database.prepare('SELECT COUNT(*) AS count FROM receipts WHERE message_id = :messageId');
  const selectIdsCommittedBefore = database.prepare('SELECT id FROM messages WHERE committed_at < :beforeTimestamp');
  const deleteMessage = database.prepare('DELETE FROM messages WHERE id = :messageId');
  const deleteReceipts = database.prepare('DELETE FROM receipts WHERE message_id = :messageId');

  return {
    /** Inserts once. Committing the same clip id again returns the existing row. */
    commit(message: Omit<ChannelMessage, 'seq' | 'heardBy'>): { message: ChannelMessage; created: boolean } {
      const result = insertMessage.run({
        id: message.id,
        senderId: message.senderId,
        senderName: message.senderName,
        durationMilliseconds: message.durationMs,
        recordedAt: message.recordedAt,
        committedAt: message.committedAt,
      });
      const row = selectMessageById.get({ messageId: message.id }) as unknown as MessageRow;
      return { message: toMessage(row), created: result.changes > 0 };
    },
    get(messageId: string): ChannelMessage | null {
      const row = selectMessageById.get({ messageId }) as unknown as MessageRow | undefined;
      return row ? toMessage(row) : null;
    },
    /** Messages with a sequence number greater than `afterSeq`, oldest first. */
    since(afterSeq: number): ChannelMessage[] {
      return (selectMessagesAfterSeq.all({ afterSeq, limit: PAGE_SIZE }) as unknown as MessageRow[]).map(toMessage);
    },
    /** Messages committed after `afterTimestamp`, oldest first. */
    committedAfter(afterTimestamp: number): ChannelMessage[] {
      return (selectMessagesCommittedAfter.all({ afterTimestamp, limit: PAGE_SIZE }) as unknown as MessageRow[]).map(toMessage);
    },
    /** Returns the new "heard by" count, or null if nothing changed. */
    markHeard(messageId: string, clientId: string): number | null {
      const result = insertReceipt.run({ clientId, messageId });
      if (result.changes === 0) return null;
      return (countReceipts.get({ messageId }) as { count: number }).count;
    },
    idsCommittedBefore(beforeTimestamp: number): string[] {
      return (selectIdsCommittedBefore.all({ beforeTimestamp }) as { id: string }[]).map((row) => row.id);
    },
    delete(messageId: string) {
      deleteReceipts.run({ messageId });
      deleteMessage.run({ messageId });
    },
    close() {
      database.close();
    },
  };
}

export type Database = ReturnType<typeof openDatabase>;
