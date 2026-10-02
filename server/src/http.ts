import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ClipComplete } from '../../shared/protocol.ts';
import type { Clients } from './clients.ts';
import { isClipId } from './clips.ts';
import type { Messages } from './messages.ts';

// The HTTP API: the resumable upload and history. Every recorded clip is
// finished through here, whether or not it was also streamed live.

const MAXIMUM_BODY_BYTES = 256 * 1024;
const MAXIMUM_CHUNK_INDEX = 10_000;

interface RequestContext {
  request: IncomingMessage;
  url: URL;
  routeParameters: Record<string, string>; // the :named parts of the route path
  clientId: string;
  clientName: string;
}

type Reply = { status: number; json: unknown } | { status: number; audio: Buffer };

interface Route {
  method: string;
  path: string;
  handle(context: RequestContext): Promise<Reply> | Reply;
}

const ok = (json: unknown): Reply => ({ status: 200, json });
const error = (status: number, message: string): Reply => ({ status, json: { error: message } });

export function createHttpHandler(messages: Messages, clients: Clients) {
  const routes: Route[] = [
    {
      method: 'GET',
      path: '/health',
      handle: () => ok({ ok: true, online: clients.online() }),
    },
    {
      method: 'GET',
      path: '/messages',
      handle: ({ url }) => {
        const since = Number(url.searchParams.get('since') ?? 0);
        return ok({ messages: messages.since(Number.isFinite(since) ? since : 0) });
      },
    },
    {
      // Which chunks have arrived, so an upload can resume.
      method: 'GET',
      path: '/clips/:id',
      handle: ({ routeParameters }) => ok(messages.uploadStatus(routeParameters.id)),
    },
    {
      // One chunk. Idempotent: sending it twice is harmless.
      method: 'PUT',
      path: '/clips/:id/chunks/:chunkIndex',
      handle: async ({ request, routeParameters }) => {
        const chunkIndex = Number(routeParameters.chunkIndex);
        if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > MAXIMUM_CHUNK_INDEX) {
          return error(400, 'bad chunk index');
        }
        messages.saveChunk(routeParameters.id, chunkIndex, new Uint8Array(await readBody(request)));
        return ok({ ok: true });
      },
    },
    {
      // Commit once every chunk is present; 409 lists the ones still missing.
      method: 'POST',
      path: '/clips/:id/complete',
      handle: async ({ request, routeParameters, clientId, clientName }) => {
        if (!clientId) return error(400, 'missing x-client-id');
        const completion = JSON.parse((await readBody(request)).toString()) as ClipComplete;
        if (!Number.isInteger(completion.total) || completion.total < 1) return error(400, 'bad total');
        const result = messages.commit(routeParameters.id, { clientId, name: clientName }, completion);
        return 'missing' in result ? { status: 409, json: result } : ok(result);
      },
    },
    {
      // The assembled µ-law clip, for playback.
      method: 'GET',
      path: '/clips/:id/audio',
      handle: ({ routeParameters }) => {
        const audio = messages.wholeClip(routeParameters.id);
        return audio ? { status: 200, audio } : error(404, 'not committed');
      },
    },
  ];

  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const found = findRoute(routes, request.method ?? 'GET', url.pathname);
      if (!found) return send(response, error(404, 'not found'));
      const reply = await found.route.handle({
        request,
        url,
        routeParameters: found.routeParameters,
        clientId: String(request.headers['x-client-id'] ?? ''),
        clientName: decodeURIComponent(String(request.headers['x-client-name'] ?? 'Unknown')),
      });
      send(response, reply);
    } catch (caught) {
      send(response, error(400, String(caught)));
    }
  };
}

/** Matches "/clips/:id/chunks/:chunkIndex"-style paths. A clip id must look like a UUID. */
function findRoute(routes: Route[], method: string, pathname: string) {
  const actual = pathname.split('/').filter(Boolean);
  for (const route of routes) {
    if (route.method !== method) continue;
    const expected = route.path.split('/').filter(Boolean);
    if (expected.length !== actual.length) continue;
    const routeParameters: Record<string, string> = {};
    const matches = expected.every((part, index) => {
      if (!part.startsWith(':')) return part === actual[index];
      routeParameters[part.slice(1)] = actual[index];
      return true;
    });
    if (!matches) continue;
    if (routeParameters.id !== undefined && !isClipId(routeParameters.id)) return null;
    return { route, routeParameters };
  }
  return null;
}

function send(response: ServerResponse, reply: Reply) {
  if ('audio' in reply) {
    response.writeHead(reply.status, { 'content-type': 'audio/basic', 'content-length': reply.audio.length });
    response.end(reply.audio);
    return;
  }
  response.writeHead(reply.status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(reply.json));
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAXIMUM_BODY_BYTES) {
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
