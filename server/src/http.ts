import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClipComplete } from '../../shared/protocol.ts';
import type { Channel } from './channel.ts';
import { isClipId, type ClipStore } from './clips.ts';
import type { Db } from './db.ts';

const MAX_BODY = 256 * 1024;

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        request.destroy();
        return;
      }
      parts.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(parts)));
    request.on('error', reject);
  });
}

export function createHttpHandler(db: Db, clips: ClipStore, channel: Channel) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? '/', 'http://x');
      const parts = url.pathname.split('/').filter(Boolean);
      const clientId = String(request.headers['x-client-id'] ?? '');
      const clientName = decodeURIComponent(String(request.headers['x-client-name'] ?? 'Unknown'));

      if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true, online: channel.online() });

      if (request.method === 'GET' && url.pathname === '/messages') {
        const since = Number(url.searchParams.get('since') ?? 0);
        return json(response, 200, { messages: db.since(Number.isFinite(since) ? since : 0) });
      }

      if (parts[0] !== 'clips' || !parts[1] || !isClipId(parts[1])) return json(response, 404, { error: 'not found' });
      const id = parts[1];

      // PUT /clips/:id/chunks/:seq — idempotent
      if (request.method === 'PUT' && parts[2] === 'chunks' && parts[3] !== undefined) {
        const seq = Number(parts[3]);
        if (!Number.isInteger(seq) || seq < 0 || seq > 10_000) return json(response, 400, { error: 'bad seq' });
        const body = await readBody(request);
        channel.recordChunk(id, seq, new Uint8Array(body));
        return json(response, 200, { ok: true });
      }

      // GET /clips/:id — which chunks have arrived (for resume)
      if (request.method === 'GET' && parts.length === 2) {
        return json(response, 200, { received: clips.received(id), committed: db.get(id) !== null });
      }

      // POST /clips/:id/complete — commit once every chunk is present
      if (request.method === 'POST' && parts[2] === 'complete') {
        if (!clientId) return json(response, 400, { error: 'missing x-client-id' });
        const info = JSON.parse((await readBody(request)).toString()) as ClipComplete;
        if (!Number.isInteger(info.total) || info.total < 1) return json(response, 400, { error: 'bad total' });
        const result = channel.commit(id, clientId, clientName, info);
        if ('missing' in result) return json(response, 409, result);
        return json(response, 200, result);
      }

      // GET /clips/:id/audio — the assembled µ-law clip
      if (request.method === 'GET' && parts[2] === 'audio') {
        const audio = clips.audio(id);
        if (!audio) return json(response, 404, { error: 'not committed' });
        response.writeHead(200, { 'content-type': 'audio/basic', 'content-length': audio.length });
        return response.end(audio);
      }

      return json(response, 404, { error: 'not found' });
    } catch (error) {
      return json(response, 400, { error: String(error) });
    }
  };
}
