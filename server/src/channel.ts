import type { RawData, WebSocket } from 'ws';
import { decodeChunkFrame, type ClientMessage } from '../../shared/protocol.ts';
import type { Client, Clients } from './clients.ts';
import { createFloor } from './floor.ts';
import type { Messages } from './messages.ts';

// The WebSocket side of the protocol. Each client message type has one handler
// below. Handlers delegate to `clients` (who is here), `floor` (who may talk)
// and `messages` (how audio becomes a message).

const MAXIMUM_CHUNK_BYTES = 64 * 1024;
const MAXIMUM_NAME_LENGTH = 40;

type MessageOf<T extends ClientMessage['type']> = Extract<ClientMessage, { type: T }>;

export function createChannel(clients: Clients, messages: Messages, log: (...details: unknown[]) => void) {
  const floor = createFloor((previousHolder, reason) => {
    log(`floor free (${reason}) ${previousHolder.name}`);
    clients.broadcast({ type: 'floor_free', clipId: previousHolder.clipId, reason });
  });

  function onHello(socket: WebSocket, hello: MessageOf<'hello'>) {
    // A reconnect can arrive before the old socket's close event: drop the old socket.
    const staleClients = clients.removeOtherSockets(hello.clientId, socket);
    for (const stale of staleClients) stale.socket.terminate();
    if (staleClients.length > 0) floor.freeIfHeldBy(hello.clientId);

    clients.add({ socket, clientId: hello.clientId, name: hello.name.slice(0, MAXIMUM_NAME_LENGTH) });
    const missed = messages.catchUp(hello.lastSeq); // lastSeq: the last message sequence number this client saw
    clients.send(socket, { type: 'welcome', online: clients.online(), floor: floor.current(), serverTime: Date.now(), missed });
    clients.broadcast({ type: 'presence', online: clients.online() }, socket);
    log(`hello ${hello.name} (lastSeq ${hello.lastSeq}, ${missed.length} to catch up)`);
  }

  function onFloorRequest(client: Client, request: MessageOf<'floor_request'>) {
    const result = floor.request(client, request.clipId);
    if (!result.granted) {
      clients.send(client.socket, { type: 'floor_denied', clipId: request.clipId, speaker: result.holder });
      log(`floor denied ${client.name} (held by ${result.holder.name})`);
      return;
    }
    clients.send(client.socket, { type: 'floor_granted', clipId: request.clipId });
    clients.broadcast({ type: 'floor_taken', speaker: result.holder }, client.socket);
    log(`floor granted ${client.name}`);
  }

  function onFloorRelease(client: Client, release: MessageOf<'floor_release'>) {
    floor.release(release.clipId);
    // total 0 means an accidental tap or a discarded clip: just free the floor.
    if (release.total >= 1) messages.commit(release.clipId, client, release);
  }

  function onAudioChunk(client: Client, frameBytes: Uint8Array) {
    if (frameBytes.length > MAXIMUM_CHUNK_BYTES) return;
    const frame = decodeChunkFrame(frameBytes);
    if (!frame) return;
    // In the protocol, `seq` is the chunk's index within its clip.
    const highestContiguousChunk = messages.saveChunk(frame.clipId, frame.seq, frame.payload);
    clients.send(client.socket, { type: 'chunk_ack', clipId: frame.clipId, upTo: highestContiguousChunk });
    // Every chunk is saved for the full clip, but only the floor holder's
    // audio is relayed live, so listeners never hear two people at once.
    if (floor.renewLease(client.clientId, frame.clipId)) clients.relay(frameBytes, client.socket);
  }

  function onClose(socket: WebSocket) {
    const client = clients.remove(socket);
    if (!client) return;
    floor.freeIfHeldBy(client.clientId);
    clients.broadcast({ type: 'presence', online: clients.online() });
    log(`bye ${client.name}`);
  }

  function onText(socket: WebSocket, text: string) {
    let message: ClientMessage;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (message.type === 'hello') return onHello(socket, message);

    const client = clients.get(socket);
    if (!client) return; // everything else needs a hello first
    switch (message.type) {
      case 'ping':
        return clients.send(socket, { type: 'pong', sentAt: message.sentAt, serverTime: Date.now() });
      case 'floor_request':
        return onFloorRequest(client, message);
      case 'floor_release':
        return onFloorRelease(client, message);
      case 'played':
        return messages.markHeard(message.messageId, client.clientId);
    }
  }

  function onBinary(socket: WebSocket, data: RawData) {
    const client = clients.get(socket);
    if (!client) return;
    const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    onAudioChunk(client, new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }

  return {
    attach(socket: WebSocket) {
      socket.on('message', (data, isBinary) => (isBinary ? onBinary(socket, data) : onText(socket, data.toString())));
      socket.on('close', () => onClose(socket));
    },
    close() {
      floor.stop();
      clients.closeAll();
    },
  };
}
