import fileSystem from 'node:fs';
import path from 'node:path';

// Audio files on disk. Each chunk is its own file, data/clips/<clipId>/<chunkIndex>.ul,
// whether it arrived over the live socket or through the resumable HTTP upload.
// Writing the same chunk twice is harmless, which makes every upload path safe
// to retry. When a clip is committed, its chunks are joined into data/clips/<clipId>.ul.

const MULAW_FILE_EXTENSION = '.ul'; // raw µ-law audio, one byte per sample
const CLIP_ID_PATTERN = /^[0-9a-f-]{36}$/i; // a UUID

/** Clip ids become folder names, so anything that isn't a UUID is rejected. */
export function isClipId(clipId: string): boolean {
  return CLIP_ID_PATTERN.test(clipId);
}

export function createClipStore(dataDirectory: string) {
  const clipsDirectory = path.join(dataDirectory, 'clips');
  fileSystem.mkdirSync(clipsDirectory, { recursive: true });

  // Every path goes through here. Checking the id keeps a crafted one like
  // "../../x" from reaching outside the data directory.
  function clipPath(clipId: string, fileName: string) {
    if (!isClipId(clipId)) throw new Error(`invalid clip id: ${clipId}`);
    return path.join(clipsDirectory, fileName);
  }
  const chunksDirectory = (clipId: string) => clipPath(clipId, clipId);
  const chunkFile = (clipId: string, chunkIndex: number) =>
    path.join(chunksDirectory(clipId), `${chunkIndex}${MULAW_FILE_EXTENSION}`);
  const wholeClipFile = (clipId: string) => clipPath(clipId, `${clipId}${MULAW_FILE_EXTENSION}`);

  /** Indexes of the chunks on disk, in ascending order. */
  function receivedChunks(clipId: string): number[] {
    if (!fileSystem.existsSync(chunksDirectory(clipId))) return [];
    return fileSystem
      .readdirSync(chunksDirectory(clipId))
      .filter((fileName) => fileName.endsWith(MULAW_FILE_EXTENSION))
      .map((fileName) => Number(fileName.slice(0, -MULAW_FILE_EXTENSION.length)))
      .sort((first, second) => first - second);
  }

  return {
    saveChunk(clipId: string, chunkIndex: number, audio: Uint8Array) {
      fileSystem.mkdirSync(chunksDirectory(clipId), { recursive: true });
      const finalPath = chunkFile(clipId, chunkIndex);
      const temporaryPath = `${finalPath}.tmp`;
      fileSystem.writeFileSync(temporaryPath, audio);
      // Renaming is atomic, so a half-written chunk never counts as received.
      fileSystem.renameSync(temporaryPath, finalPath);
    },
    receivedChunks,
    /** The highest chunk index with no gaps before it (what we acknowledge to the sender), or -1. */
    highestContiguousChunk(clipId: string): number {
      const received = new Set(receivedChunks(clipId));
      let highest = -1;
      while (received.has(highest + 1)) highest++;
      return highest;
    },
    /** Indexes from 0 to totalChunks - 1 that are not on disk yet. */
    missingChunks(clipId: string, totalChunks: number): number[] {
      const received = new Set(receivedChunks(clipId));
      const missing: number[] = [];
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        if (!received.has(chunkIndex)) missing.push(chunkIndex);
      }
      return missing;
    },
    /** Joins chunks 0 to totalChunks - 1 into one file and returns its size in bytes. Check `missingChunks` first. */
    joinChunks(clipId: string, totalChunks: number): number {
      const chunks: Buffer[] = [];
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        chunks.push(fileSystem.readFileSync(chunkFile(clipId, chunkIndex)));
      }
      const wholeClip = Buffer.concat(chunks);
      fileSystem.writeFileSync(wholeClipFile(clipId), wholeClip);
      return wholeClip.length;
    },
    /** The joined clip, or null if it hasn't been committed. */
    wholeClip(clipId: string): Buffer | null {
      const file = wholeClipFile(clipId);
      return fileSystem.existsSync(file) ? fileSystem.readFileSync(file) : null;
    },
    remove(clipId: string) {
      fileSystem.rmSync(chunksDirectory(clipId), { recursive: true, force: true });
      fileSystem.rmSync(wholeClipFile(clipId), { force: true });
    },
  };
}

export type ClipStore = ReturnType<typeof createClipStore>;
