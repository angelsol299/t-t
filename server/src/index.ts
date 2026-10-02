import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RETENTION_DAYS } from '../../shared/protocol.ts';
import { createChannel } from './channel.ts';
import { createClipStore } from './clips.ts';
import { openDb } from './db.ts';
import { createHttpHandler } from './http.ts';

export interface ServerOptions {
  port: number;
  dataDir: string;
  quiet?: boolean;
}

export function createServer({ port, dataDir, quiet }: ServerOptions) {
  fs.mkdirSync(dataDir, { recursive: true });
  const log = quiet ? () => {} : (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
  const db = openDb(dataDir);
  const clips = createClipStore(dataDir);
  const channel = createChannel(db, clips, log);

  const server = http.createServer(createHttpHandler(db, clips, channel));
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => channel.attach(ws));

  // Retention: recordings are kept for RETENTION_DAYS, then deleted.
  const sweep = () => {
    const ids = db.expiredIds(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    for (const id of ids) {
      clips.remove(id);
      db.delete(id);
    }
    if (ids.length) log(`retention: deleted ${ids.length} clips`);
  };
  sweep();
  const retention = setInterval(sweep, 60 * 60 * 1000);

  const ready = new Promise<void>((resolve) => server.listen(port, '0.0.0.0', resolve));

  return {
    ready,
    port,
    async close() {
      clearInterval(retention);
      channel.close();
      wss.close();
      await new Promise((r) => server.close(r));
      db.close();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const dataDir = process.env.DATA_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
  const s = createServer({ port, dataDir });
  s.ready.then(() => console.log(`Teton Talk server on :${port} (data in ${dataDir})`));
}
