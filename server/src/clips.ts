import fs from 'node:fs';
import path from 'node:path';

// Chunks land on disk as data/clips/<clipId>/<seq>.ul, whether they arrived
// over the live socket or through the resumable HTTP upload. Writing the same
// chunk twice is harmless, which makes every upload path idempotent.

const ID_RE = /^[0-9a-f-]{36}$/i;

export function isClipId(id: string): boolean {
  return ID_RE.test(id);
}

export function createClipStore(dataDir: string) {
  const root = path.join(dataDir, 'clips');
  fs.mkdirSync(root, { recursive: true });

  const dir = (id: string) => path.join(root, id);
  const assembled = (id: string) => path.join(root, `${id}.ul`);

  return {
    putChunk(id: string, seq: number, bytes: Uint8Array) {
      fs.mkdirSync(dir(id), { recursive: true });
      const target = path.join(dir(id), `${seq}.ul`);
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, bytes);
      fs.renameSync(tmp, target); // atomic: a half-written chunk never counts as received
    },
    received(id: string): number[] {
      if (!fs.existsSync(dir(id))) return [];
      return fs
        .readdirSync(dir(id))
        .filter((f) => f.endsWith('.ul'))
        .map((f) => Number(f.slice(0, -3)))
        .sort((a, b) => a - b);
    },
    missing(id: string, total: number): number[] {
      const have = new Set(this.received(id));
      const out: number[] = [];
      for (let i = 0; i < total; i++) if (!have.has(i)) out.push(i);
      return out;
    },
    /** Concatenates chunks 0..total-1 into one file. Caller checks `missing` first. */
    assemble(id: string, total: number): number {
      const parts: Buffer[] = [];
      for (let i = 0; i < total; i++) parts.push(fs.readFileSync(path.join(dir(id), `${i}.ul`)));
      const all = Buffer.concat(parts);
      fs.writeFileSync(assembled(id), all);
      return all.length;
    },
    audio(id: string): Buffer | null {
      const file = assembled(id);
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    },
    remove(id: string) {
      fs.rmSync(dir(id), { recursive: true, force: true });
      fs.rmSync(assembled(id), { force: true });
    },
  };
}

export type ClipStore = ReturnType<typeof createClipStore>;
