import { readdir, stat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import {
  albumIdsByTrack,
  clearTracksMissing,
  findTrackByPath,
  listTrackPaths,
  markTracksMissing,
  settleAlbums,
  upsertTrack,
} from '../db/library.js';
import { persistArtwork } from './artworkIngest.js';
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
  /** Subdirectories skipped as unreadable (e.g. `System Volume Information`). Not fatal; see `findAudioFiles`. */
  unreadableDirs: number;
  durationMs: number;
  failures: ScanFailure[];
}

/**
 * Walked one directory at a time: recursive `readdir` is all-or-nothing, and one locked folder (a Windows drive's
 * `System Volume Information`) would abort the whole drive.
 */
async function findAudioFiles(root: string): Promise<{ files: string[]; unreadableDirs: number }> {
  const files: string[] = [];
  let unreadableDirs = 0;

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      unreadableDirs++;
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  }

  await walk(root);
  return { files, unreadableDirs };
}

type ScanFileResult = { status: 'added' | 'updated' } | { status: 'failed'; error: string };

async function scanFile(filePath: string, rootId: number): Promise<ScanFileResult> {
  try {
    const [stats, tags] = await Promise.all([stat(filePath), extractTrackTags(filePath)]);

    const existed = Boolean(findTrackByPath(filePath));

    const track = upsertTrack({
      path: filePath,
      fileSize: stats.size,
      rootId,
      ...tags,
    });

    await persistArtwork(track.id, track.album_id, tags.picture);

    return { status: existed ? 'updated' : 'added' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to scan ${filePath}: ${message}`);
    return { status: 'failed', error: message };
  }
}

/** After each file; `processed` includes it. Files run concurrently, so calls arrive in completion order. */
export type ScanProgressCallback = (processed: number, total: number) => void;

/** Files scanned at once. Tag parsing is I/O-bound but heavier than a stat, hence lower than reconcile's batch. */
const SCAN_CONCURRENCY = 6;

/**
 * Walks `libraryRoot`, reads tags and upserts each file by path; bad files are logged and skipped. The root is a
 * parameter so the walked directory is visible at the call site. `onProgress` feeds librarySync's progress.
 */
export async function scanLibrary(
  libraryRoot: string,
  rootId: number,
  onProgress?: ScanProgressCallback,
): Promise<ScanSummary> {
  const start = Date.now();

  const { files, unreadableDirs } = await findAudioFiles(libraryRoot);
  const albumsBefore = albumIdsByTrack(rootId);

  let filesAdded = 0;
  let filesUpdated = 0;
  const failures: ScanFailure[] = [];

  let processed = 0;

  for (let i = 0; i < files.length; i += SCAN_CONCURRENCY) {
    const batch = files.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(batch.map((filePath) => scanFile(filePath, rootId)));

    batch.forEach((filePath, index) => {
      const result = results[index];
      if (result.status === 'failed') {
        failures.push({ path: filePath, error: result.error });
      } else if (result.status === 'added') {
        filesAdded++;
      } else {
        filesUpdated++;
      }
      onProgress?.(++processed, files.length);
    });
  }

  const settled = settleAlbums(albumsBefore);
  if (settled.artistsSet > 0 || settled.merged > 0) {
    console.log(`Albums settled: ${settled.artistsSet} artist(s) worked out from tracks, ${settled.merged} merged`);
  }

  return {
    filesFound: files.length,
    filesAdded,
    filesUpdated,
    filesFailed: failures.length,
    unreadableDirs,
    durationMs: Date.now() - start,
    failures,
  };
}

export interface ReconcileSummary {
  /** Track rows checked against disk. */
  checked: number;
  /** Rows newly stamped missing by this sweep. */
  newlyMissing: number;
  /** Rows whose file came back, and whose flag was cleared. */
  recovered: number;
  /** Rows flagged missing in total, including ones from earlier sweeps. */
  missingTotal: number;
  /** Missing rows outside `libraryRoot` entirely: leftovers no scan of this root can heal. */
  strandedOutsideRoot: number;
  /** Paths that exist but could not be read (permissions, I/O). Never marked. */
  unreadable: number;
  /** Set when the guard refused to mark anything, and why. */
  aborted?: string;
  durationMs: number;
}

/** Enough parallelism to hide I/O latency, few enough to not exhaust fds. */
const STAT_CONCURRENCY = 32;

/** The guard's floor: below this many newly missing, the ratio isn't consulted (1 of 2 is already 50%). */
const GUARD_MIN_NEWLY_MISSING = 3;

async function pathIsMissing(path: string): Promise<'present' | 'missing' | 'unreadable'> {
  try {
    await stat(path);
    return 'present';
  } catch (err) {
    // Only ENOENT counts as missing; a permission or I/O error may hide a file that exists.
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable';
  }
}

/**
 * Stamps `missing_since` on gone files, clears it on returned ones; never deletes. If a sweep would newly mark over
 * `abortRatio` of this root's tracks (and at least the floor), it changes nothing: an unmounted drive looks deleted.
 */
export async function reconcileMissingTracks(
  libraryRoot: string,
  rootId: number,
  options: { abortRatio?: number; now?: Date } = {},
): Promise<ReconcileSummary> {
  const start = Date.now();
  const abortRatio = options.abortRatio ?? 0.5;
  const at = (options.now ?? new Date()).toISOString();

  const rows = listTrackPaths(rootId);
  const base = {
    checked: rows.length,
    newlyMissing: 0,
    recovered: 0,
    missingTotal: rows.filter((r) => r.missing_since !== null).length,
    strandedOutsideRoot: 0,
    unreadable: 0,
    durationMs: 0,
  };

  if (rows.length === 0) {
    return { ...base, durationMs: Date.now() - start };
  }

  // If the library root itself is gone, nothing below it can be judged. This
  // is the mount-not-ready case, and it is the common one.
  try {
    await stat(libraryRoot);
  } catch {
    return {
      ...base,
      aborted: `library root is unreadable (${libraryRoot}), so nothing was marked`,
      durationMs: Date.now() - start,
    };
  }

  const missing: number[] = [];
  const present: number[] = [];
  let unreadable = 0;

  for (let i = 0; i < rows.length; i += STAT_CONCURRENCY) {
    const batch = rows.slice(i, i + STAT_CONCURRENCY);
    const results = await Promise.all(batch.map((row) => pathIsMissing(row.path)));

    batch.forEach((row, index) => {
      const result = results[index];
      if (result === 'missing') missing.push(row.id);
      else if (result === 'present') present.push(row.id);
      else unreadable++;
    });
  }

  const alreadyMissing = new Set(
    rows.filter((r) => r.missing_since !== null).map((r) => r.id),
  );
  const newlyMissing = missing.filter((id) => !alreadyMissing.has(id));

  if (
    newlyMissing.length >= GUARD_MIN_NEWLY_MISSING &&
    newlyMissing.length / rows.length > abortRatio
  ) {
    return {
      ...base,
      unreadable,
      aborted:
        `${newlyMissing.length} of ${rows.length} tracks went missing at once, over the ` +
        `${Math.round(abortRatio * 100)}% limit. Treating this as a storage failure, not a ` +
        'library change. Nothing was marked.',
      durationMs: Date.now() - start,
    };
  }

  const recovered = present.filter((id) => alreadyMissing.has(id));

  markTracksMissing(newlyMissing, at);
  clearTracksMissing(recovered);

  const missingIds = new Set(missing);
  const withRoot = libraryRoot.endsWith(sep) ? libraryRoot : libraryRoot + sep;

  return {
    checked: rows.length,
    newlyMissing: newlyMissing.length,
    recovered: recovered.length,
    missingTotal: missing.length,
    strandedOutsideRoot: rows.filter((r) => missingIds.has(r.id) && !r.path.startsWith(withRoot))
      .length,
    unreadable,
    durationMs: Date.now() - start,
  };
}
