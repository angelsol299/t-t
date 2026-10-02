import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClipComplete } from '../../shared/protocol.ts';
import type { Channel } from './channel.ts';
import { isClipId, type ClipStore } from './clips.ts';
import type { Db } from './db.ts';

const MAX_BODY = 256 * 1024;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

export function createHttpHandler(db: Db, clips: ClipStore, channel: Channel) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const parts = url.pathname.split('/').filter(Boolean);
      const clientId = String(req.headers['x-client-id'] ?? '');
      const clientName = decodeURIComponent(String(req.headers['x-client-name'] ?? 'Unknown'));

      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, online: channel.online() });

      if (req.method === 'GET' && url.pathname === '/messages') {
        const since = Number(url.searchParams.get('since') ?? 0);
        return json(res, 200, { messages: db.since(Number.isFinite(since) ? since : 0) });
      }

      if (parts[0] !== 'clips' || !parts[1] || !isClipId(parts[1])) return json(res, 404, { error: 'not found' });
      const id = parts[1];

      // PUT /clips/:id/chunks/:seq — idempotent
      if (req.method === 'PUT' && parts[2] === 'chunks' && parts[3] !== undefined) {
        const seq = Number(parts[3]);
        if (!Number.isInteger(seq) || seq < 0 || seq > 10_000) return json(res, 400, { error: 'bad seq' });
        const body = await readBody(req);
        channel.recordChunk(id, seq, new Uint8Array(body));
        return json(res, 200, { ok: true });
      }

      // GET /clips/:id — which chunks have arrived (for resume)
      if (req.method === 'GET' && parts.length === 2) {
        return json(res, 200, { received: clips.received(id), committed: db.get(id) !== null });
      }

      // POST /clips/:id/complete — commit once every chunk is present
      if (req.method === 'POST' && parts[2] === 'complete') {
        if (!clientId) return json(res, 400, { error: 'missing x-client-id' });
        const info = JSON.parse((await readBody(req)).toString()) as ClipComplete;
        if (!Number.isInteger(info.total) || info.total < 1) return json(res, 400, { error: 'bad total' });
        const result = channel.commit(id, clientId, clientName, info);
        if ('missing' in result) return json(res, 409, result);
        return json(res, 200, result);
      }

      // GET /clips/:id/audio — the assembled µ-law clip
      if (req.method === 'GET' && parts[2] === 'audio') {
        const audio = clips.audio(id);
        if (!audio) return json(res, 404, { error: 'not committed' });
        res.writeHead(200, { 'content-type': 'audio/basic', 'content-length': audio.length });
        return res.end(audio);
      }

      return json(res, 404, { error: 'not found' });
    } catch (err) {
      return json(res, 400, { error: String(err) });
    }
  };
}
