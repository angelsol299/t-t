import fs from 'node:fs';
import { encodeSample } from '../../shared/mulaw.ts';

// Reads a 16-bit PCM WAV and writes raw µ-law bytes.
const [input, output] = process.argv.slice(2);
const buf = fs.readFileSync(input);
let off = 12;
while (off < buf.length) {
  const id = buf.toString('ascii', off, off + 4);
  const size = buf.readUInt32LE(off + 4);
  if (id === 'data') {
    const n = size / 2;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = encodeSample(buf.readInt16LE(off + 8 + i * 2));
    fs.writeFileSync(output, out);
    console.log(`${output}: ${(n / 8000).toFixed(1)}s`);
    process.exit(0);
  }
  off += 8 + size + (size % 2);
}
throw new Error('no data chunk');
