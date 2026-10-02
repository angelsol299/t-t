import type { WebSocket } from 'ws';
import type { ServerMessage } from '../../shared/protocol.ts';

// Who is connected. There is one entry per open socket that has said hello.
// While reconnecting, a person (clientId) can briefly have two sockets, so the
// online count is the number of distinct people, not sockets.

export interface Client {
  socket: WebSocket;
  clientId: string;
  name: string;
}

export function createClients() {
  const clientsBySocket = new Map<WebSocket, Client>();
  const isOpen = (socket: WebSocket) => socket.readyState === socket.OPEN;

  return {
    get(socket: WebSocket): Client | undefined {
      return clientsBySocket.get(socket);
    },
    add(client: Client) {
      clientsBySocket.set(client.socket, client);
    },
    /** Removes and returns the client on this socket, if it had said hello. */
    remove(socket: WebSocket): Client | undefined {
      const client = clientsBySocket.get(socket);
      clientsBySocket.delete(socket);
      return client;
    },
    /** Removes and returns this person's other sockets (left over from before a reconnect). */
    removeOtherSockets(clientId: string, keep: WebSocket): Client[] {
      const stale = [...clientsBySocket.values()].filter((client) => client.clientId === clientId && client.socket !== keep);
      for (const client of stale) clientsBySocket.delete(client.socket);
      return stale;
    },
    online(): number {
      return new Set([...clientsBySocket.values()].map((client) => client.clientId)).size;
    },
    send(socket: WebSocket, message: ServerMessage) {
      if (isOpen(socket)) socket.send(JSON.stringify(message));
    },
    broadcast(message: ServerMessage, except?: WebSocket) {
      const data = JSON.stringify(message);
      for (const socket of clientsBySocket.keys()) if (socket !== except && isOpen(socket)) socket.send(data);
    },
    /** Forwards a binary audio frame to everyone except the sender. */
    relay(frame: Uint8Array, from: WebSocket) {
      for (const socket of clientsBySocket.keys()) if (socket !== from && isOpen(socket)) socket.send(frame);
    },
    closeAll() {
      for (const socket of clientsBySocket.keys()) socket.terminate();
    },
  };
}

export type Clients = ReturnType<typeof createClients>;
