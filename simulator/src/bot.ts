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
  type ClientMessage,
  type ClipComplete,
  type ServerMessage,
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
  log?: (message: string) => void;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function tone(ms: number): Uint8Array {
  const sampleCount = Math.round((ms / 1000) * SAMPLE_RATE);
  const output = new Uint8Array(sampleCount);
  for (let index = 0; index < sampleCount; index++) output[index] = 0x80 | Math.round(8 + 6 * Math.sin(index / 7)); // quiet µ-law hum
  return output;
}

export class Bot extends EventEmitter {
  readonly name: string;
  readonly clientId: string;
  server: string;
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private sample: Uint8Array | undefined;
  private log: (text: string) => void;

  up = false;
  lastSeq = 0;
  online = 0;
  floor: Speaker | null = null;
  /** Every committed message this bot has been told about, in arrival order. */
  messages: ChannelMessage[] = [];
  heard = new Map<string, Set<number>>(); // clipId → chunk seqs received live
  pending = new Map<string, Pending>(); // outbox: clips the server has not committed
  chunkUploads = 0; // chunk uploads over HTTP (for resume assertions)

  constructor(options: BotOptions) {
    super();
    this.name = options.name;
    this.clientId = options.clientId ?? randomUUID();
    this.server = options.server.replace(/\/$/, '');
    this.sample = options.sample;
    this.log = options.log ?? (() => {});
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
    const socket = new WebSocket(`${this.server.replace(/^http/, 'ws')}/ws`);
    this.socket = socket;
    socket.binaryType = 'nodebuffer';
    socket.on('open', () => this.send({ type: 'hello', clientId: this.clientId, name: this.name, lastSeq: this.lastSeq }));
    socket.on('message', (data: Buffer, isBinary) => {
      if (socket !== this.socket) return;
      if (isBinary) return this.onBinary(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      this.onMessage(JSON.parse(data.toString()) as ServerMessage);
    });
    const onSocketClosed = () => {
      if (socket !== this.socket) return;
      this.socket = null;
      if (this.up) this.emit('down');
      this.up = false;
      this.floor = null;
      if (!this.stopped) this.reconnectTimer = setTimeout(() => this.open(), 500);
    };
    socket.on('close', onSocketClosed);
    socket.on('error', onSocketClosed);
  }

  close() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.terminate();
    this.socket = null;
    this.up = false;
  }

  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private onMessage(message: ServerMessage) {
    switch (message.type) {
      case 'welcome':
        this.up = true;
        this.online = message.online;
        this.floor = message.floor;
        this.receive(message.missed);
        this.emit('welcome', message);
        void this.flush();
        break;
      case 'presence':
        this.online = message.online;
        break;
      case 'floor_taken':
        this.floor = message.speaker;
        this.emit('floor_taken', message.speaker);
        break;
      case 'floor_free':
        if (this.floor?.clipId === message.clipId) this.floor = null;
        this.emit('floor_free', message);
        break;
      case 'floor_granted':
      case 'floor_denied':
        this.emit(message.type, message);
        break;
      case 'message':
        this.receive([message.message]);
        break;
      case 'receipt':
        this.emit('receipt', message);
        break;
    }
  }

  private receive(list: ChannelMessage[]) {
    for (const message of list) {
      this.messages.push(message);
      this.lastSeq = Math.max(this.lastSeq, message.seq);
      if (this.pending.delete(message.id)) this.emit('committed', message);
      if (message.senderId !== this.clientId) this.send({ type: 'played', messageId: message.id });
      this.emit('message', message);
    }
  }

  private onBinary(data: Uint8Array) {
    const frame = decodeChunkFrame(data);
    if (!frame) return;
    let set = this.heard.get(frame.clipId);
    if (!set) this.heard.set(frame.clipId, (set = new Set()));
    set.add(frame.seq);
    this.emit('chunk', frame);
  }

  private audio(ms: number): Uint8Array {
    const sampleCount = Math.round((ms / 1000) * SAMPLE_RATE);
    const source = this.sample && this.sample.length > 0 ? this.sample : tone(ms);
    const output = new Uint8Array(sampleCount);
    for (let index = 0; index < sampleCount; index++) output[index] = source[index % source.length];
    return output;
  }

  /**
   * Talk for `ms`. Requests the floor when connected; if denied, nothing is
   * recorded (like the app). If the link is down or drops mid-clip, the clip
   * is kept and uploaded once the server is reachable.
   */
  async talk(ms: number, options: { realtime?: boolean } = {}): Promise<TalkResult> {
    const realtime = options.realtime ?? true;
    const clipId = randomUUID();
    const recordedAt = Date.now();
    let live = false;
    if (this.up) {
      const answer = await new Promise<'granted' | 'denied' | 'timeout'>((resolve) => {
        const done = (result: 'granted' | 'denied' | 'timeout') => {
          this.off('floor_granted', onGrant);
          this.off('floor_denied', onDeny);
          clearTimeout(timer);
          resolve(result);
        };
        const onGrant = (message: { clipId: string }) => message.clipId === clipId && done('granted');
        const onDeny = (message: { clipId: string }) => message.clipId === clipId && done('denied');
        const timer = setTimeout(() => done('timeout'), 1000);
        this.on('floor_granted', onGrant);
        this.on('floor_denied', onDeny);
        this.send({ type: 'floor_request', clipId, recordedAt });
      });
      if (answer === 'denied') {
        this.log(`${this.name}: someone got there first`);
        return { clipId, granted: false, live: false };
      }
      live = answer === 'granted';
    }

    const audio = this.audio(ms);
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < audio.length; offset += CHUNK_SAMPLES)
      chunks.push(audio.subarray(offset, offset + CHUNK_SAMPLES));
    this.log(`${this.name}: talking ${(ms / 1000).toFixed(1)}s (${live ? 'live' : 'record-and-send'})`);
    const pending: Pending = { clipId, chunks, info: { total: chunks.length, durationMs: ms, recordedAt } };
    this.pending.set(clipId, pending);

    for (let seq = 0; seq < chunks.length; seq++) {
      if (realtime) await sleep(CHUNK_MS);
      if (live && this.socket?.readyState === WebSocket.OPEN) this.socket.send(encodeChunkFrame(clipId, seq, chunks[seq]));
    }
    if (live && this.up) this.send({ type: 'floor_release', clipId, ...pending.info });
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
      for (const entry of [...this.pending.values()]) {
        const response = await this.http(`/clips/${entry.clipId}`);
        const { received, committed } = (await response.json()) as { received: number[]; committed: boolean };
        if (!committed) {
          const have = new Set(received);
          for (let seq = 0; seq < entry.chunks.length; seq++) {
            if (have.has(seq)) continue;
            const put = await this.http(`/clips/${entry.clipId}/chunks/${seq}`, {
              method: 'PUT',
              body: new Uint8Array(entry.chunks[seq]),
            });
            if (!put.ok) throw new Error(`put ${put.status}`);
            this.chunkUploads++;
          }
        }
        const done = await this.http(`/clips/${entry.clipId}/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(entry.info),
        });
        if (!done.ok) throw new Error(`complete ${done.status}`);
        const { message } = (await done.json()) as { message: ChannelMessage };
        if (this.pending.delete(entry.clipId)) this.emit('committed', message);
      }
    } catch {
      setTimeout(() => void this.flush(), 500); // link is bad: retry, never drop
    } finally {
      this.flushing = false;
    }
  }

  /** Resolves once this bot has been told about a committed message matching `pred`. */
  waitFor(predicate: (message: ChannelMessage) => boolean, ms = 15_000): Promise<ChannelMessage> {
    const found = this.messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('message', on);
        reject(new Error(`${this.name}: timed out waiting for message`));
      }, ms);
      const on = (message: ChannelMessage) => {
        if (!predicate(message)) return;
        clearTimeout(timer);
        this.off('message', on);
        resolve(message);
      };
      this.on('message', on);
    });
  }
}
