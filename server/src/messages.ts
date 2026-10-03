import { SAMPLE_RATE, isLate, type ChannelMessage, type ClipComplete } from '../../shared/protocol.ts';
import type { Clients } from './clients.ts';
import type { ClipStore } from './clips.ts';
import type { Database } from './database.ts';

// How audio becomes a message. Chunks arrive over the live socket or through
// the resumable HTTP upload, and both paths store them the same way. A clip is
// committed only when every chunk from 0 to total - 1 is on disk. The clip id
// is the idempotency key: retries and duplicates never create a second message.

const FIRST_JOIN_HISTORY_MILLISECONDS = 12 * 60 * 60 * 1000; // a first join sees the current shift

export type CommitResult = { message: ChannelMessage } | { missing: number[] };

export interface Sender {
  clientId: string;
  name: string;
}

export function createMessages(database: Database, clipStore: ClipStore, clients: Clients, log: (...details: unknown[]) => void) {
  // For each clip still uploading: the chunks that have arrived, and the
  // highest chunk index with no gaps before it (what we acknowledge to the sender).
  const uploads = new Map<string, { receivedChunks: Set<number>; highestContiguousChunk: number }>();

  /** Saves one chunk. Returns the highest chunk index received with no gaps before it. */
  function saveChunk(clipId: string, chunkIndex: number, audio: Uint8Array): number {
    clipStore.saveChunk(clipId, chunkIndex, audio);
    let upload = uploads.get(clipId);
    if (!upload) {
      // Start from what is on disk, so acknowledgements stay correct after a server restart.
      upload = { receivedChunks: new Set(clipStore.receivedChunks(clipId)), highestContiguousChunk: -1 };
      uploads.set(clipId, upload);
    }
    upload.receivedChunks.add(chunkIndex);
    while (upload.receivedChunks.has(upload.highestContiguousChunk + 1)) upload.highestContiguousChunk++;
    return upload.highestContiguousChunk;
  }

  /** The only way a message comes into existence. Safe to call any number of times. */
  function commit(clipId: string, sender: Sender, completion: ClipComplete): CommitResult {
    const existing = database.get(clipId);
    if (existing) return { message: existing };

    const missing = clipStore.missingChunks(clipId, completion.total);
    if (missing.length > 0) return { missing };

    const byteCount = clipStore.joinChunks(clipId, completion.total);
    const now = Date.now();
    const { message, created } = database.commit({
      id: clipId,
      senderId: sender.clientId,
      senderName: sender.name,
      durationMs: Math.round((byteCount / SAMPLE_RATE) * 1000), // µ-law is one byte per sample
      recordedAt: Math.min(completion.recordedAt, now), // a phone clock can't put a clip in the future
      committedAt: now,
    });
    uploads.delete(clipId);

    if (created) {
      log(`commit #${message.seq} ${sender.name} ${message.durationMs}ms${isLate(message) ? ' (late)' : ''}`);
      clients.broadcast({ type: 'message', message });
    }
    return { message };
  }

  function markHeard(messageId: string, clientId: string) {
    const heardBy = database.markHeard(messageId, clientId);
    if (heardBy !== null) clients.broadcast({ type: 'receipt', messageId, heardBy });
  }

  return {
    saveChunk,
    commit,
    markHeard,
    /** What a client missed: everything after its last seen sequence number, or the current shift on a first join. */
    catchUp(lastSeenSeq: number): ChannelMessage[] {
      return lastSeenSeq > 0
        ? database.since(lastSeenSeq)
        : database.committedAfter(Date.now() - FIRST_JOIN_HISTORY_MILLISECONDS);
    },
    since(afterSeq: number): ChannelMessage[] {
      return database.since(afterSeq);
    },
    /** Which chunks of a clip the server has, so an upload can resume. */
    uploadStatus(clipId: string) {
      return { received: clipStore.receivedChunks(clipId), committed: database.get(clipId) !== null };
    },
    /** The whole clip, once committed. */
    wholeClip(clipId: string): Buffer | null {
      return clipStore.wholeClip(clipId);
    },
    /** Retention: deletes messages committed before `beforeTimestamp`. Returns how many. */
    deleteCommittedBefore(beforeTimestamp: number): number {
      const messageIds = database.idsCommittedBefore(beforeTimestamp);
      for (const messageId of messageIds) {
        clipStore.remove(messageId);
        database.delete(messageId);
      }
      return messageIds.length;
    },
  };
}

export type Messages = ReturnType<typeof createMessages>;
