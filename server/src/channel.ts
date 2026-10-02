import type { WebSocket } from 'ws';
import {
  FLOOR_LEASE_MS,
  SAMPLE_RATE,
  decodeChunkFrame,
  type ChannelMessage,
  type ClientMessage,
  type ClipComplete,
  type FloorFreeReason,
  type ServerMessage,
  type Speaker,
} from '../../shared/protocol.ts';
import type { ClipStore } from './clips.ts';
import type { Db } from './db.ts';

const HISTORY_MS = 12 * 60 * 60 * 1000; // first join sees the current shift
const MAX_CHUNK_BYTES = 64 * 1024;

interface Client {
  ws: WebSocket;
  clientId: string;
  name: string;
}

export type CommitResult = { message: ChannelMessage } | { missing: number[] };

export function createChannel(db: Db, clips: ClipStore, log: (...args: unknown[]) => void) {
  const clients = new Map<WebSocket, Client>();
  let floor: (Speaker & { lastDataAt: number }) | null = null;
  // Per-clip set of chunk seqs seen this process, used for contiguous acks.
  const seen = new Map<string, { set: Set<number>; upTo: number }>();

  const send = (clientSocket: WebSocket, message: ServerMessage) => {
    if (clientSocket.readyState === clientSocket.OPEN) clientSocket.send(JSON.stringify(message));
  };
  const broadcast = (message: ServerMessage, except?: WebSocket) => {
    const data = JSON.stringify(message);
    for (const [clientSocket] of clients) if (clientSocket !== except && clientSocket.readyState === clientSocket.OPEN) clientSocket.send(data);
  };
  const onlineCount = () => new Set([...clients.values()].map((client) => client.clientId)).size;
  const publicFloor = (): Speaker | null =>
    floor && { clientId: floor.clientId, name: floor.name, clipId: floor.clipId, startedAt: floor.startedAt };

  function freeFloor(reason: FloorFreeReason) {
    if (!floor) return;
    const clipId = floor.clipId;
    log(`floor free (${reason}) ${floor.name}`);
    floor = null;
    broadcast({ type: 'floor_free', clipId, reason });
  }

  function recordChunk(clipId: string, seq: number, payload: Uint8Array): number {
    clips.putChunk(clipId, seq, payload);
    let seenChunks = seen.get(clipId);
    if (!seenChunks) {
      // Seed from disk so acks stay correct after a server restart.
      seenChunks = { set: new Set(clips.received(clipId)), upTo: -1 };
      seen.set(clipId, seenChunks);
    }
    seenChunks.set.add(seq);
    while (seenChunks.set.has(seenChunks.upTo + 1)) seenChunks.upTo++;
    return seenChunks.upTo;
  }

  /** The only way a message comes into existence. Idempotent per clip id. */
  function commit(clipId: string, senderId: string, senderName: string, info: ClipComplete): CommitResult {
    const existing = db.get(clipId);
    if (existing) return { message: existing };
    const missing = clips.missing(clipId, info.total);
    if (missing.length > 0) return { missing };
    const bytes = clips.assemble(clipId, info.total);
    const now = Date.now();
    const { message, created } = db.commit({
      id: clipId,
      senderId,
      senderName,
      durationMs: Math.round((bytes / SAMPLE_RATE) * 1000),
      recordedAt: Math.min(info.recordedAt, now),
      committedAt: now,
    });
    seen.delete(clipId);
    if (created) {
      log(`commit #${message.seq} ${senderName} ${message.durationMs}ms${now - info.recordedAt > 30_000 ? ' (late)' : ''}`);
      broadcast({ type: 'message', message });
    }
    return { message };
  }

  function markHeard(messageId: string, clientId: string) {
    const heardBy = db.markHeard(messageId, clientId);
    if (heardBy !== null) broadcast({ type: 'receipt', messageId, heardBy });
  }

  function onText(clientSocket: WebSocket, rawText: string) {
    let message: ClientMessage;
    try {
      message = JSON.parse(rawText);
    } catch {
      return;
    }
    if (message.type === 'hello') {
      for (const [other, client] of clients) {
        // A reconnect can beat the old socket's close; drop the stale one.
        if (client.clientId === message.clientId && other !== clientSocket) {
          clients.delete(other);
          other.terminate();
          if (floor?.clientId === message.clientId) freeFloor('disconnected');
        }
      }
      clients.set(clientSocket, { ws: clientSocket, clientId: message.clientId, name: message.name.slice(0, 40) });
      const missed = message.lastSeq > 0 ? db.since(message.lastSeq) : db.recent(Date.now() - HISTORY_MS);
      send(clientSocket, { type: 'welcome', online: onlineCount(), floor: publicFloor(), serverTime: Date.now(), missed });
      broadcast({ type: 'presence', online: onlineCount() }, clientSocket);
      log(`hello ${message.name} (lastSeq ${message.lastSeq}, ${missed.length} to catch up)`);
      return;
    }
    const me = clients.get(clientSocket);
    if (!me) return;
    switch (message.type) {
      case 'ping':
        send(clientSocket, { type: 'pong', sentAt: message.sentAt, serverTime: Date.now() });
        break;
      case 'floor_request': {
        if (floor && floor.clientId !== me.clientId) {
          send(clientSocket, { type: 'floor_denied', clipId: message.clipId, speaker: publicFloor()! });
          log(`floor denied ${me.name} (held by ${floor.name})`);
          break;
        }
        floor = {
          clientId: me.clientId,
          name: me.name,
          clipId: message.clipId,
          startedAt: Date.now(),
          lastDataAt: Date.now(),
        };
        send(clientSocket, { type: 'floor_granted', clipId: message.clipId });
        broadcast({ type: 'floor_taken', speaker: publicFloor()! }, clientSocket);
        log(`floor granted ${me.name}`);
        break;
      }
      case 'floor_release': {
        if (floor?.clipId === message.clipId) freeFloor('released');
        // total 0 = accidental tap or discarded clip: just free the floor.
        if (message.total >= 1) commit(message.clipId, me.clientId, me.name, message);
        break;
      }
      case 'played':
        markHeard(message.messageId, me.clientId);
        break;
    }
  }

  function onBinary(clientSocket: WebSocket, data: Uint8Array) {
    const me = clients.get(clientSocket);
    if (!me || data.length > MAX_CHUNK_BYTES) return;
    const frame = decodeChunkFrame(data);
    if (!frame) return;
    const upTo = recordChunk(frame.clipId, frame.seq, frame.payload);
    send(clientSocket, { type: 'chunk_ack', clipId: frame.clipId, upTo });
    // Only the floor holder is relayed live; anything else is stored for the
    // full clip but not played, so listeners never hear two people at once.
    if (floor && floor.clipId === frame.clipId && floor.clientId === me.clientId) {
      floor.lastDataAt = Date.now();
      for (const [other] of clients) if (other !== clientSocket && other.readyState === other.OPEN) other.send(data);
    }
  }

  const leaseTimer = setInterval(() => {
    if (floor && Date.now() - floor.lastDataAt > FLOOR_LEASE_MS) freeFloor('lease_expired');
  }, 250);

  return {
    attach(clientSocket: WebSocket) {
      clientSocket.on('message', (data, isBinary) => {
        if (isBinary) {
          const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
          onBinary(clientSocket, new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        } else {
          onText(clientSocket, data.toString());
        }
      });
      clientSocket.on('close', () => {
        const me = clients.get(clientSocket);
        if (!me) return;
        clients.delete(clientSocket);
        if (floor?.clientId === me.clientId) freeFloor('disconnected');
        broadcast({ type: 'presence', online: onlineCount() });
        log(`bye ${me.name}`);
      });
    },
    commit,
    recordChunk,
    online: onlineCount,
    markHeard,
    broadcast,
    close() {
      clearInterval(leaseTimer);
      for (const [clientSocket] of clients) clientSocket.terminate();
    },
  };
}

export type Channel = ReturnType<typeof createChannel>;
