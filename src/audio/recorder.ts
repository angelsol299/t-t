import { AudioManager, AudioRecorder } from 'react-native-audio-api';
import { CHUNK_SAMPLES, SAMPLE_RATE } from '@shared/protocol';
import { encodeFloat, meterLevel, resample, rootMeanSquare } from '@shared/mulaw';
import { setupSession } from './context';

// Mic → 8kHz µ-law chunks of CHUNK_MS. The device may not honour the requested
// rate, so every buffer is resampled from whatever rate it actually has.

export interface RecordingHandlers {
  onChunk(seq: number, bytes: Uint8Array): void;
  onLevel(level: number): void;
}

let recorder: AudioRecorder | null = null;
let pending = new Float32Array(0);
let seq = 0;
let samples = 0;
let handlers: RecordingHandlers | null = null;
let lastLevelAt = 0;

function append(head: Float32Array, tail: Float32Array) {
  const output = new Float32Array(head.length + tail.length);
  output.set(head);
  output.set(tail, head.length);
  return output;
}

function emit(frame: Float32Array) {
  const bytes = encodeFloat(frame);
  samples += frame.length;
  handlers?.onChunk(seq++, bytes);
}

export async function micPermission(ask: boolean): Promise<boolean> {
  const status = ask ? await AudioManager.requestRecordingPermissions() : await AudioManager.checkRecordingPermissions();
  return status === 'Granted';
}

export async function startRecording(recordingHandlers: RecordingHandlers): Promise<boolean> {
  setupSession();
  if (!recorder) {
    recorder = new AudioRecorder();
    recorder.disableFileOutput();
  }
  handlers = recordingHandlers;
  pending = new Float32Array(0);
  seq = 0;
  samples = 0;
  recorder.onAudioReady({ sampleRate: 16000, bufferLength: 1600, channelCount: 1 }, ({ buffer }) => {
    if (!handlers) return;
    const data = buffer.getChannelData(0);
    const now = Date.now();
    if (now - lastLevelAt > 90) {
      lastLevelAt = now;
      handlers.onLevel(meterLevel(rootMeanSquare(data)));
    }
    pending = append(pending, resample(data, buffer.sampleRate, SAMPLE_RATE));
    while (pending.length >= CHUNK_SAMPLES) {
      emit(pending.subarray(0, CHUNK_SAMPLES));
      pending = pending.slice(CHUNK_SAMPLES);
    }
  });
  await AudioManager.setAudioSessionActivity(true);
  const res = await recorder.start();
  return res.status === 'success';
}

/** Stops the mic and flushes the tail. Returns the clip's chunk count and length. */
export async function stopRecording(): Promise<{ total: number; durationMs: number }> {
  if (recorder) {
    await recorder.stop();
    recorder.clearOnAudioReady();
  }
  if (pending.length > 0) emit(pending);
  pending = new Float32Array(0);
  handlers = null;
  return { total: seq, durationMs: Math.round((samples / SAMPLE_RATE) * 1000) };
}
