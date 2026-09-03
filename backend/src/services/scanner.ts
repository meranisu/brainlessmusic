import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { config } from '../config.js';
import { findTrackByPath, upsertTrack } from '../db/library.js';
import { AUDIO_EXTENSIONS, extractTrackTags } from './trackTags.js';

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
    const [stats, tags] = await Promise.all([stat(filePath), extractTrackTags(filePath)]);

    const existed = Boolean(findTrackByPath(filePath));

    upsertTrack({
      path: filePath,
      fileSize: stats.size,
      ...tags,
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
