import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import {
  CHUNK_MS,
  CHUNK_SAMPLES,
  SAMPLE_RATE,
  decodeChunkFrame,
  encodeChunkFrame,
  type ChannelMessage,
  type ClientMsg,
  type ClipComplete,
  type ServerMsg,
  type Speaker,
} from '../../shared/protocol.ts';

// A headless caregiver. It speaks the same protocol as the app: live streaming
// when it holds the floor, and the same resumable upload for anything the
// server did not get, so tests exercise the real recovery paths.

export interface BotOptions {
  name: string;
  server: string; // http://host:port (usually a Toxiproxy port)
  sample?: Uint8Array; // µ-law audio to "say"; silence-ish tone if absent
  clientId?: string;
  log?: (msg: string) => void;
}

interface Pending {
  clipId: string;
  chunks: Uint8Array[];
  info: ClipComplete;
}

export interface TalkResult {
  clipId: string;
  granted: boolean;
  live: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tone(ms: number): Uint8Array {
  const n = Math.round((ms / 1000) * SAMPLE_RATE);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = 0x80 | Math.round(8 + 6 * Math.sin(i / 7)); // quiet µ-law hum
  return out;
}

export class Bot extends EventEmitter {
  readonly name: string;
  readonly clientId: string;
  server: string;
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private sample: Uint8Array | undefined;
  private log: (m: string) => void;

  up = false;
  lastSeq = 0;
  online = 0;
  floor: Speaker | null = null;
  /** Every committed message this bot has been told about, in arrival order. */
  messages: ChannelMessage[] = [];
  heard = new Map<string, Set<number>>(); // clipId → chunk seqs received live
  pending = new Map<string, Pending>(); // outbox: clips the server has not committed
  puts = 0; // chunk uploads over HTTP (for resume assertions)

  constructor(opts: BotOptions) {
    super();
    this.name = opts.name;
    this.clientId = opts.clientId ?? randomUUID();
    this.server = opts.server.replace(/\/$/, '');
    this.sample = opts.sample;
    this.log = opts.log ?? (() => {});
  }

  connect(): Promise<void> {
    this.stopped = false;
    return new Promise((resolve) => {
      this.once('welcome', () => resolve());
      this.open();
    });
  }

  private open() {
    if (this.stopped) return;
    const ws = new WebSocket(`${this.server.replace(/^http/, 'ws')}/ws`);
    this.ws = ws;
    ws.binaryType = 'nodebuffer';
    ws.on('open', () => this.send({ t: 'hello', clientId: this.clientId, name: this.name, lastSeq: this.lastSeq }));
    ws.on('message', (data: Buffer, isBinary) => {
      if (ws !== this.ws) return;
      if (isBinary) return this.onBinary(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      this.onMessage(JSON.parse(data.toString()) as ServerMsg);
    });
    const dead = () => {
      if (ws !== this.ws) return;
      this.ws = null;
      if (this.up) this.emit('down');
      this.up = false;
      this.floor = null;
      if (!this.stopped) this.reconnectTimer = setTimeout(() => this.open(), 500);
    };
    ws.on('close', dead);
    ws.on('error', dead);
  }

  close() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.terminate();
    this.ws = null;
    this.up = false;
  }

  private send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private onMessage(msg: ServerMsg) {
    switch (msg.t) {
      case 'welcome':
        this.up = true;
        this.online = msg.online;
        this.floor = msg.floor;
        this.receive(msg.missed);
        this.emit('welcome', msg);
        void this.flush();
        break;
      case 'presence':
        this.online = msg.online;
        break;
      case 'floor_taken':
        this.floor = msg.speaker;
        this.emit('floor_taken', msg.speaker);
        break;
      case 'floor_free':
        if (this.floor?.clipId === msg.clipId) this.floor = null;
        this.emit('floor_free', msg);
        break;
      case 'floor_granted':
      case 'floor_denied':
        this.emit(msg.t, msg);
        break;
      case 'message':
        this.receive([msg.message]);
        break;
      case 'receipt':
        this.emit('receipt', msg);
        break;
    }
  }

  private receive(list: ChannelMessage[]) {
    for (const m of list) {
      this.messages.push(m);
      this.lastSeq = Math.max(this.lastSeq, m.seq);
      if (this.pending.delete(m.id)) this.emit('committed', m);
      if (m.senderId !== this.clientId) this.send({ t: 'played', msgId: m.id });
      this.emit('message', m);
    }
  }

  private onBinary(data: Uint8Array) {
    const f = decodeChunkFrame(data);
    if (!f) return;
    let set = this.heard.get(f.clipId);
    if (!set) this.heard.set(f.clipId, (set = new Set()));
    set.add(f.seq);
    this.emit('chunk', f);
  }

  private audio(ms: number): Uint8Array {
    const want = Math.round((ms / 1000) * SAMPLE_RATE);
    const src = this.sample && this.sample.length > 0 ? this.sample : tone(ms);
    const out = new Uint8Array(want);
    for (let i = 0; i < want; i++) out[i] = src[i % src.length];
    return out;
  }

  /**
   * Talk for `ms`. Requests the floor when connected; if denied, nothing is
   * recorded (like the app). If the link is down or drops mid-clip, the clip
   * is kept and uploaded once the server is reachable.
   */
  async talk(ms: number, opts: { realtime?: boolean } = {}): Promise<TalkResult> {
    const realtime = opts.realtime ?? true;
    const clipId = randomUUID();
    const recordedAt = Date.now();
    let live = false;
    if (this.up) {
      const answer = await new Promise<'granted' | 'denied' | 'timeout'>((resolve) => {
        const done = (r: 'granted' | 'denied' | 'timeout') => {
          this.off('floor_granted', onGrant);
          this.off('floor_denied', onDeny);
          clearTimeout(t);
          resolve(r);
        };
        const onGrant = (m: { clipId: string }) => m.clipId === clipId && done('granted');
        const onDeny = (m: { clipId: string }) => m.clipId === clipId && done('denied');
        const t = setTimeout(() => done('timeout'), 1000);
        this.on('floor_granted', onGrant);
        this.on('floor_denied', onDeny);
        this.send({ t: 'floor_request', clipId, recordedAt });
      });
      if (answer === 'denied') {
        this.log(`${this.name}: someone got there first`);
        return { clipId, granted: false, live: false };
      }
      live = answer === 'granted';
    }

    const audio = this.audio(ms);
    const chunks: Uint8Array[] = [];
    for (let o = 0; o < audio.length; o += CHUNK_SAMPLES) chunks.push(audio.subarray(o, o + CHUNK_SAMPLES));
    this.log(`${this.name}: talking ${(ms / 1000).toFixed(1)}s (${live ? 'live' : 'record-and-send'})`);
    const pending: Pending = { clipId, chunks, info: { total: chunks.length, durationMs: ms, recordedAt } };
    this.pending.set(clipId, pending);

    for (let seq = 0; seq < chunks.length; seq++) {
      if (realtime) await sleep(CHUNK_MS);
      if (live && this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeChunkFrame(clipId, seq, chunks[seq]));
    }
    if (live && this.up) this.send({ t: 'floor_release', clipId, ...pending.info });
    setTimeout(() => void this.flush(), live ? 800 : 0);
    return { clipId, granted: live, live };
  }

  private async http(path: string, init: RequestInit = {}) {
    return fetch(`${this.server}${path}`, {
      ...init,
      signal: AbortSignal.timeout(3000),
      headers: { ...(init.headers ?? {}), 'x-client-id': this.clientId, 'x-client-name': encodeURIComponent(this.name) },
    });
  }

  /** The outbox: resumable upload of every clip the server has not committed. */
  async flush(): Promise<void> {
    if (this.flushing || this.pending.size === 0) return;
    this.flushing = true;
    try {
      for (const p of [...this.pending.values()]) {
        const res = await this.http(`/clips/${p.clipId}`);
        const { received, committed } = (await res.json()) as { received: number[]; committed: boolean };
        if (!committed) {
          const have = new Set(received);
          for (let seq = 0; seq < p.chunks.length; seq++) {
            if (have.has(seq)) continue;
            const put = await this.http(`/clips/${p.clipId}/chunks/${seq}`, { method: 'PUT', body: new Uint8Array(p.chunks[seq]) });
            if (!put.ok) throw new Error(`put ${put.status}`);
            this.puts++;
          }
        }
        const done = await this.http(`/clips/${p.clipId}/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(p.info),
        });
        if (!done.ok) throw new Error(`complete ${done.status}`);
        const { message } = (await done.json()) as { message: ChannelMessage };
        if (this.pending.delete(p.clipId)) this.emit('committed', message);
      }
    } catch {
      setTimeout(() => void this.flush(), 500); // link is bad: retry, never drop
    } finally {
      this.flushing = false;
    }
  }

  /** Resolves once this bot has been told about a committed message matching `pred`. */
  waitFor(pred: (m: ChannelMessage) => boolean, ms = 15_000): Promise<ChannelMessage> {
    const found = this.messages.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.off('message', on);
        reject(new Error(`${this.name}: timed out waiting for message`));
      }, ms);
      const on = (m: ChannelMessage) => {
        if (!pred(m)) return;
        clearTimeout(t);
        this.off('message', on);
        resolve(m);
      };
      this.on('message', on);
    });
  }
}
