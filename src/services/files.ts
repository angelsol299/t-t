import { Directory, File, Paths } from 'expo-file-system';

// Recorded clips live on disk one chunk per file (clips/<id>/<chunkIndex>.ul),
// written before the chunk is sent anywhere. The phone's copy is the source
// of truth until the server has committed the clip.
// Downloaded clips for playback are cached as one file (audio/<id>.ul).

const clipsRoot = new Directory(Paths.document, 'clips');
const audioRoot = new Directory(Paths.cache, 'audio');

function ensure(directory: Directory) {
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
}

const clipDir = (id: string) => new Directory(clipsRoot, id);

export const clipFiles = {
  writeChunk(id: string, chunkIndex: number, bytes: Uint8Array) {
    const directory = clipDir(id);
    ensure(directory);
    const file = new File(directory, `${chunkIndex}.ul`);
    file.write(bytes);
  },
  readChunk(id: string, chunkIndex: number): Uint8Array | null {
    const file = new File(clipDir(id), `${chunkIndex}.ul`);
    return file.exists ? file.bytesSync() : null;
  },
  /** Chunk indexes present on disk, ascending. */
  chunks(id: string): number[] {
    const directory = clipDir(id);
    if (!directory.exists) return [];
    return directory
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.ul'))
      .map((file) => Number(file.name.slice(0, -3)))
      .filter((chunkIndex) => Number.isInteger(chunkIndex))
      .sort((first, second) => first - second);
  },
  /** Whole clip, for local playback of a clip that is not on the server yet. */
  readAll(id: string): Uint8Array | null {
    const chunkIndexes = clipFiles.chunks(id);
    if (chunkIndexes.length === 0) return null;
    const parts = chunkIndexes.map((chunkIndex) => clipFiles.readChunk(id, chunkIndex) ?? new Uint8Array(0));
    const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  },
  remove(id: string) {
    const directory = clipDir(id);
    if (directory.exists) directory.delete();
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
