import { AudioContext, AudioManager } from 'react-native-audio-api';
import { SAMPLE_RATE } from '@shared/protocol';
import { decodeToFloat, resample } from '@shared/mulaw';

let sharedContext: AudioContext | null = null;
let sessionReady = false;

/** Walkie audio plays through the loudspeaker and records from the mic at once. */
export function setupSession() {
  if (sessionReady) return;
  sessionReady = true;
  AudioManager.setAudioSessionOptions({
    iosCategory: 'playAndRecord',
    iosMode: 'default',
    iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
  });
}

export function audioContext(): AudioContext {
  if (!sharedContext) {
    setupSession();
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

/**
 * µ-law bytes → an AudioBuffer at the context's rate. Buffer sources read
 * frames at the context rate and ignore the buffer's own sampleRate, so 8kHz
 * audio must be upsampled here or it plays ~6× fast and sounds like noise.
 */
export function mulawBuffer(bytes: Uint8Array) {
  const context = audioContext();
  const samples = resample(decodeToFloat(bytes), SAMPLE_RATE, context.sampleRate);
  const audioBuffer = context.createBuffer(1, Math.max(1, samples.length), context.sampleRate);
  audioBuffer.copyToChannel(samples, 0);
  return audioBuffer;
}
