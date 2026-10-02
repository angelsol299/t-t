import { Directory, File, Paths } from 'expo-file-system';

// Recorded clips live on disk one chunk per file (clips/<id>/<seq>.ul),
// written before the chunk is sent anywhere. The phone's copy is the source
// of truth until the server has committed the clip.
// Downloaded clips for playback are cached as one file (audio/<id>.ul).

const clipsRoot = new Directory(Paths.document, 'clips');
const audioRoot = new Directory(Paths.cache, 'audio');

function ensure(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

const clipDir = (id: string) => new Directory(clipsRoot, id);

export const clipFiles = {
  writeChunk(id: string, seq: number, bytes: Uint8Array) {
    const dir = clipDir(id);
    ensure(dir);
    const file = new File(dir, `${seq}.ul`);
    file.write(bytes);
  },
  readChunk(id: string, seq: number): Uint8Array | null {
    const file = new File(clipDir(id), `${seq}.ul`);
    return file.exists ? file.bytesSync() : null;
  },
  /** Chunk seqs present on disk, ascending. */
  chunks(id: string): number[] {
    const dir = clipDir(id);
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.ul'))
      .map((file) => Number(file.name.slice(0, -3)))
      .filter((seq) => Number.isInteger(seq))
      .sort((first, second) => first - second);
  },
  /** Whole clip, for local playback of a clip that is not on the server yet. */
  readAll(id: string): Uint8Array | null {
    const seqs = clipFiles.chunks(id);
    if (seqs.length === 0) return null;
    const parts = seqs.map((seq) => clipFiles.readChunk(id, seq) ?? new Uint8Array(0));
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  },
  remove(id: string) {
    const dir = clipDir(id);
    if (dir.exists) dir.delete();
  },
};

export const audioCache = {
  get(id: string): Uint8Array | null {
    const file = new File(audioRoot, `${id}.ul`);
    return file.exists ? file.bytesSync() : null;
  },
  put(id: string, bytes: Uint8Array) {
    ensure(audioRoot);
    new File(audioRoot, `${id}.ul`).write(bytes);
  },
};
