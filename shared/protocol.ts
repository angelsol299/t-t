// Wire protocol shared by the app, the server, the bots and the tests.
// JSON text frames carry control messages; binary frames carry audio chunks.

export const SAMPLE_RATE = 8000; // G.711 µ-law, 1 byte per sample
export const CHUNK_MS = 250;
export const CHUNK_SAMPLES = (SAMPLE_RATE * CHUNK_MS) / 1000;
export const FLOOR_LEASE_MS = 3000; // floor frees if the speaker sends nothing for this long
export const MIN_CLIP_MS = 300; // shorter holds are treated as accidental taps
export const MAX_CLIP_MS = 60_000;
export const LATE_MS = 30_000; // clips committed later than this are tagged "Sent N min ago"
export const RETENTION_DAYS = 30;

export type FloorFreeReason = 'released' | 'lease_expired' | 'disconnected';

export interface Speaker {
  clientId: string;
  name: string;
  clipId: string;
  startedAt: number;
}

export interface ChannelMessage {
  seq: number;
  id: string; // clipId — the idempotency key
  senderId: string;
  senderName: string;
  durationMs: number;
  recordedAt: number; // server clock
  committedAt: number; // server clock
  heardBy: number;
}

export type ClientMsg =
  | { t: 'hello'; clientId: string; name: string; lastSeq: number }
  | { t: 'floor_request'; clipId: string; recordedAt: number }
  | { t: 'floor_release'; clipId: string; total: number; durationMs: number; recordedAt: number }
  | { t: 'played'; msgId: string }
  | { t: 'ping'; ts: number };

export type ServerMsg =
  | { t: 'welcome'; online: number; floor: Speaker | null; serverTime: number; missed: ChannelMessage[] }
  | { t: 'presence'; online: number }
  | { t: 'floor_granted'; clipId: string }
  | { t: 'floor_denied'; clipId: string; speaker: Speaker }
  | { t: 'floor_taken'; speaker: Speaker }
  | { t: 'floor_free'; clipId: string; reason: FloorFreeReason }
  | { t: 'chunk_ack'; clipId: string; upTo: number }
  | { t: 'message'; message: ChannelMessage }
  | { t: 'receipt'; msgId: string; heardBy: number }
  | { t: 'pong'; ts: number; serverTime: number };

// HTTP API (resumable upload + history)
//   GET  /messages?since=<seq>              -> { messages: ChannelMessage[] }
//   PUT  /clips/:id/chunks/:seq             body: µ-law bytes        -> { ok: true }
//   GET  /clips/:id                         -> { received: number[], committed: boolean }
//   POST /clips/:id/complete                body: ClipComplete       -> { message: ChannelMessage } | 409 { missing: number[] }
//   GET  /clips/:id/audio                   -> µ-law bytes of the whole clip
//   Headers on every request: x-client-id, x-client-name

export interface ClipComplete {
  total: number;
  durationMs: number;
  recordedAt: number; // server clock
}

// ── binary chunk frames ────────────────────────────────────────────────
// [0]      frame type (1 = audio chunk)
// [1..36]  clipId as ASCII uuid
// [37..40] seq, uint32 big-endian
// [41..]   µ-law payload

export const FRAME_AUDIO = 1;
const ID_LEN = 36;
const HEADER = 1 + ID_LEN + 4;

export function encodeChunkFrame(clipId: string, seq: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER + payload.length);
  out[0] = FRAME_AUDIO;
  for (let i = 0; i < ID_LEN; i++) out[1 + i] = clipId.charCodeAt(i);
  new DataView(out.buffer).setUint32(1 + ID_LEN, seq, false);
  out.set(payload, HEADER);
  return out;
}

export function decodeChunkFrame(
  data: Uint8Array,
): { clipId: string; seq: number; payload: Uint8Array } | null {
  if (data.length < HEADER || data[0] !== FRAME_AUDIO) return null;
  let clipId = '';
  for (let i = 0; i < ID_LEN; i++) clipId += String.fromCharCode(data[1 + i]);
  const seq = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(1 + ID_LEN, false);
  return { clipId, seq, payload: data.subarray(HEADER) };
}

export function isLate(m: Pick<ChannelMessage, 'recordedAt' | 'committedAt'>): boolean {
  return m.committedAt - m.recordedAt > LATE_MS;
}
