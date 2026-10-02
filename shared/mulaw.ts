// G.711 µ-law codec plus a small resampler. Pure JS so it runs in the app,
// the server and the bots alike.

const BIAS = 0x84;
const CLIP = 32635;

export function encodeSample(pcm: number): number {
  let sign = (pcm >> 8) & 0x80;
  if (sign) pcm = -pcm;
  if (pcm > CLIP) pcm = CLIP;
  pcm += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function decodeSample(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const sample = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  return sign ? -sample : sample;
}

const DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) DECODE_TABLE[i] = decodeSample(i);

/** Float samples in [-1, 1] → µ-law bytes. */
export function encodeFloat(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = encodeSample(Math.round(s * 32767));
  }
  return out;
}

/** µ-law bytes → float samples in [-1, 1]. */
export function decodeToFloat(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = DECODE_TABLE[bytes[i]] / 32768;
  return out;
}

/** µ-law bytes → 16-bit PCM. */
export function decodeToInt16(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = DECODE_TABLE[bytes[i]];
  return out;
}

/**
 * Resample float audio. Downsampling averages the source samples that fall in
 * each output slot (a cheap low-pass that keeps aliasing down for voice);
 * upsampling interpolates linearly.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array<ArrayBuffer> {
  if (fromRate === toRate) return new Float32Array(input);
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  if (ratio > 1) {
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      out[i] = end > start ? sum / (end - start) : 0;
    }
  } else {
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const j = Math.floor(pos);
      const frac = pos - j;
      const a = input[j] ?? 0;
      const b = input[j + 1] ?? a;
      out[i] = a + (b - a) * frac;
    }
  }
  return out;
}

/** Root-mean-square level in [0, 1], used for the level meter. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Level meter value from a µ-law chunk. */
export function rmsMulaw(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) {
    const s = DECODE_TABLE[bytes[i]] / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / bytes.length);
}
