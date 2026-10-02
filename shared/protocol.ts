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

export type ClientMessage =
  | { type: 'hello'; clientId: string; name: string; lastSeq: number }
  | { type: 'floor_request'; clipId: string; recordedAt: number }
  | { type: 'floor_release'; clipId: string; total: number; durationMs: number; recordedAt: number }
  | { type: 'played'; messageId: string }
  | { type: 'ping'; sentAt: number };

export type ServerMessage =
  | { type: 'welcome'; online: number; floor: Speaker | null; serverTime: number; missed: ChannelMessage[] }
  | { type: 'presence'; online: number }
  | { type: 'floor_granted'; clipId: string }
  | { type: 'floor_denied'; clipId: string; speaker: Speaker }
  | { type: 'floor_taken'; speaker: Speaker }
  | { type: 'floor_free'; clipId: string; reason: FloorFreeReason }
  | { type: 'chunk_ack'; clipId: string; upTo: number }
  | { type: 'message'; message: ChannelMessage }
  | { type: 'receipt'; messageId: string; heardBy: number }
  | { type: 'pong'; sentAt: number; serverTime: number };

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
const CLIP_ID_LENGTH = 36;
const FRAME_HEADER_LENGTH = 1 + CLIP_ID_LENGTH + 4;

export function encodeChunkFrame(clipId: string, seq: number, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(FRAME_HEADER_LENGTH + payload.length);
  output[0] = FRAME_AUDIO;
  for (let index = 0; index < CLIP_ID_LENGTH; index++) output[1 + index] = clipId.charCodeAt(index);
  new DataView(output.buffer).setUint32(1 + CLIP_ID_LENGTH, seq, false);
  output.set(payload, FRAME_HEADER_LENGTH);
  return output;
}

export function decodeChunkFrame(
  data: Uint8Array,
): { clipId: string; seq: number; payload: Uint8Array } | null {
  if (data.length < FRAME_HEADER_LENGTH || data[0] !== FRAME_AUDIO) return null;
  let clipId = '';
  for (let index = 0; index < CLIP_ID_LENGTH; index++) clipId += String.fromCharCode(data[1 + index]);
  const seq = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(1 + CLIP_ID_LENGTH, false);
  return { clipId, seq, payload: data.subarray(FRAME_HEADER_LENGTH) };
}

export function isLate(message: Pick<ChannelMessage, 'recordedAt' | 'committedAt'>): boolean {
  return message.committedAt - message.recordedAt > LATE_MS;
}
