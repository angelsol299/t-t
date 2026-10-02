import fileSystem from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RETENTION_DAYS } from '../../shared/protocol.ts';
import { createChannel } from './channel.ts';
import { createClients } from './clients.ts';
import { createClipStore } from './clips.ts';
import { openDatabase } from './database.ts';
import { createHttpHandler } from './http.ts';
import { createMessages } from './messages.ts';

// Boots the server and wires the modules together:
//
//   database.ts       storage: SQLite rows (messages and receipts)
//   clips.ts          storage: audio chunk files on disk
//   clients.ts        who is connected (sending and broadcasting)
//   messages.ts       how audio becomes a message (chunks, commit, receipts)
//   floor.ts          who may talk (used by channel.ts)
//   channel.ts        the WebSocket protocol: one handler per message type
//   http.ts           the HTTP API: resumable upload and history

const RETENTION_SWEEP_INTERVAL_MILLISECONDS = 60 * 60 * 1000;
const ONE_DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface ServerOptions {
  port: number;
  dataDirectory: string;
  quiet?: boolean;
}

export function createServer({ port, dataDirectory, quiet }: ServerOptions) {
  fileSystem.mkdirSync(dataDirectory, { recursive: true });
  const timeOfDay = () => new Date().toISOString().slice(11, 19); // HH:MM:SS
  const log = quiet ? () => {} : (...details: unknown[]) => console.log(timeOfDay(), ...details);

  const database = openDatabase(dataDirectory);
  const clients = createClients();
  const messages = createMessages(database, createClipStore(dataDirectory), clients, log);
  const channel = createChannel(clients, messages, log);

  const server = http.createServer(createHttpHandler(messages, clients));
  const webSocketServer = new WebSocketServer({ server, path: '/ws' });
  webSocketServer.on('connection', (socket) => channel.attach(socket));

  // Retention: recordings are kept for RETENTION_DAYS, then deleted.
  const deleteExpiredMessages = () => {
    const deletedCount = messages.deleteCommittedBefore(Date.now() - RETENTION_DAYS * ONE_DAY_MILLISECONDS);
    if (deletedCount > 0) log(`retention: deleted ${deletedCount} clips`);
  };
  deleteExpiredMessages();
  const retentionTimer = setInterval(deleteExpiredMessages, RETENTION_SWEEP_INTERVAL_MILLISECONDS);

  const ready = new Promise<void>((resolve) => server.listen(port, '0.0.0.0', resolve));

  return {
    ready,
    port,
    async close() {
      clearInterval(retentionTimer);
      channel.close();
      webSocketServer.close();
      await new Promise((resolve) => server.close(resolve));
      database.close();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const dataDirectory = process.env.DATA_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
  const server = createServer({ port, dataDirectory });
  server.ready.then(() => console.log(`Teton Talk server on :${port} (data in ${dataDirectory})`));
}
