import { AudioContext, AudioManager } from 'react-native-audio-api';
import { SAMPLE_RATE } from '@shared/protocol';
import { decodeToFloat } from '@shared/mulaw';

let ctx: AudioContext | null = null;
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
  if (!ctx) {
    setupSession();
    ctx = new AudioContext();
  }
  return ctx;
}

/** µ-law bytes → an AudioBuffer at 8kHz; the context resamples on playback. */
export function mulawBuffer(bytes: Uint8Array) {
  const c = audioContext();
  const pcm = decodeToFloat(bytes);
  const buf = c.createBuffer(1, Math.max(1, pcm.length), SAMPLE_RATE);
  buf.copyToChannel(pcm, 0);
  return buf;
}
