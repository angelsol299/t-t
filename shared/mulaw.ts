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

export function decodeSample(byte: number): number {
  byte = ~byte & 0xff;
  const sign = byte & 0x80;
  const exponent = (byte >> 4) & 0x07;
  const mantissa = byte & 0x0f;
  const sample = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  return sign ? -sample : sample;
}

const DECODE_TABLE = new Int16Array(256);
for (let byte = 0; byte < 256; byte++) DECODE_TABLE[byte] = decodeSample(byte);

/** Float samples in [-1, 1] → µ-law bytes. */
export function encodeFloat(samples: Float32Array): Uint8Array {
  const output = new Uint8Array(samples.length);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    output[index] = encodeSample(Math.round(sample * 32767));
  }
  return output;
}

/** µ-law bytes → float samples in [-1, 1]. */
export function decodeToFloat(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const output = new Float32Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) output[index] = DECODE_TABLE[bytes[index]] / 32768;
  return output;
}

/**
 * Resample float audio. Downsampling averages the source samples that fall in
 * each output slot (a cheap low-pass that keeps aliasing down for voice);
 * upsampling interpolates linearly.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array<ArrayBuffer> {
  if (fromRate === toRate) return new Float32Array(input);
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  if (ratio > 1) {
    for (let index = 0; index < outputLength; index++) {
      const start = Math.floor(index * ratio);
      const end = Math.min(input.length, Math.floor((index + 1) * ratio));
      let sum = 0;
      for (let sourceIndex = start; sourceIndex < end; sourceIndex++) sum += input[sourceIndex];
      output[index] = end > start ? sum / (end - start) : 0;
    }
  } else {
    for (let index = 0; index < outputLength; index++) {
      const sourcePosition = index * ratio;
      const sourceIndex = Math.floor(sourcePosition);
      const fraction = sourcePosition - sourceIndex;
      const before = input[sourceIndex] ?? 0;
      const after = input[sourceIndex + 1] ?? before;
      output[index] = before + (after - before) * fraction;
    }
  }
  return output;
}

/** Root-mean-square level in [0, 1], used for the level meter. */
export function rootMeanSquare(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index++) sum += samples[index] * samples[index];
  return Math.sqrt(sum / samples.length);
}

/**
 * Root-mean-square loudness → the 0..1 value the level meter shows.
 * Speech rarely goes above 0.25 RMS, so it is scaled up to fill the meter.
 */
export function meterLevel(rootMeanSquareValue: number): number {
  return Math.min(1, rootMeanSquareValue * 4);
}

/** Level meter value from a µ-law chunk. */
export function mulawRootMeanSquare(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < bytes.length; index++) {
    const sample = DECODE_TABLE[bytes[index]] / 32768;
    sum += sample * sample;
  }
  return Math.sqrt(sum / bytes.length);
}
