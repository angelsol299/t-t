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

  const directory = (id: string) => path.join(root, id);
  const assembled = (id: string) => path.join(root, `${id}.ul`);

  return {
    putChunk(id: string, seq: number, bytes: Uint8Array) {
      fs.mkdirSync(directory(id), { recursive: true });
      const target = path.join(directory(id), `${seq}.ul`);
      const tempPath = `${target}.tmp`;
      fs.writeFileSync(tempPath, bytes);
      fs.renameSync(tempPath, target); // atomic: a half-written chunk never counts as received
    },
    received(id: string): number[] {
      if (!fs.existsSync(directory(id))) return [];
      return fs
        .readdirSync(directory(id))
        .filter((file) => file.endsWith('.ul'))
        .map((file) => Number(file.slice(0, -3)))
        .sort((first, second) => first - second);
    },
    missing(id: string, total: number): number[] {
      const have = new Set(this.received(id));
      const output: number[] = [];
      for (let seq = 0; seq < total; seq++) if (!have.has(seq)) output.push(seq);
      return output;
    },
    /** Concatenates chunks 0..total-1 into one file. Caller checks `missing` first. */
    assemble(id: string, total: number): number {
      const parts: Buffer[] = [];
      for (let seq = 0; seq < total; seq++) parts.push(fs.readFileSync(path.join(directory(id), `${seq}.ul`)));
      const all = Buffer.concat(parts);
      fs.writeFileSync(assembled(id), all);
      return all.length;
    },
    audio(id: string): Buffer | null {
      const file = assembled(id);
      return fs.existsSync(file) ? fs.readFileSync(file) : null;
    },
    remove(id: string) {
      fs.rmSync(directory(id), { recursive: true, force: true });
      fs.rmSync(assembled(id), { force: true });
    },
  };
}

export type ClipStore = ReturnType<typeof createClipStore>;
