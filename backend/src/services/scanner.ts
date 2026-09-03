import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { parseFile } from 'music-metadata';
import { config } from '../config.js';
import { findTrackByPath, upsertTrack } from '../db/library.js';

const AUDIO_EXTENSIONS = new Set(['.flac', '.opus', '.mp3', '.m4a', '.ogg']);

export interface ScanFailure {
  path: string;
  error: string;
}

export interface ScanSummary {
  filesFound: number;
  filesAdded: number;
  filesUpdated: number;
  filesFailed: number;
  durationMs: number;
  failures: ScanFailure[];
}

async function findAudioFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    files.push(join(entry.parentPath ?? entry.path, entry.name));
  }

  return files;
}

type ScanFileResult = { status: 'added' | 'updated' } | { status: 'failed'; error: string };

async function scanFile(filePath: string): Promise<ScanFileResult> {
  try {
    const [stats, metadata] = await Promise.all([
      stat(filePath),
      parseFile(filePath, { duration: true }),
    ]);
    const { common, format } = metadata;

    const fileNameWithoutExt = basename(filePath, extname(filePath));
    const title = common.title?.trim() || fileNameWithoutExt;
    const artistName = common.artist?.trim() || common.albumartist?.trim() || 'Unknown Artist';
    const albumTitle = common.album?.trim() || null;

    const existed = Boolean(findTrackByPath(filePath));

    upsertTrack({
      path: filePath,
      title,
      artistName,
      albumTitle,
      albumYear: common.year ?? null,
      trackNumber: common.track?.no ?? null,
      duration: format.duration ?? null,
      format: format.codec ?? format.container ?? extname(filePath).slice(1).toUpperCase(),
      fileSize: stats.size,
    });

    return { status: existed ? 'updated' : 'added' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to scan ${filePath}: ${message}`);
    return { status: 'failed', error: message };
  }
}

/**
 * Walks config.libraryPath for supported audio files, reads tags via
 * music-metadata, and upserts each into the DB by path. Per-file failures
 * (corrupt/unparseable files) are logged and skipped rather than aborting
 * the whole scan.
 */
export async function scanLibrary(): Promise<ScanSummary> {
  const start = Date.now();

  const files = await findAudioFiles(config.libraryPath);

  let filesAdded = 0;
  let filesUpdated = 0;
  const failures: ScanFailure[] = [];

  for (const filePath of files) {
    const result = await scanFile(filePath);
    if (result.status === 'failed') {
      failures.push({ path: filePath, error: result.error });
    } else if (result.status === 'added') {
      filesAdded++;
    } else {
      filesUpdated++;
    }
  }

  return {
    filesFound: files.length,
    filesAdded,
    filesUpdated,
    filesFailed: failures.length,
    durationMs: Date.now() - start,
    failures,
  };
}
