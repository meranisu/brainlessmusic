import { readdir, stat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import {
  albumIdsByTrack,
  clearTracksMissing,
  findTrackByPath,
  listTrackFileStamps,
  listTrackPaths,
  markTracksMissing,
  settleAlbums,
  upsertTrack,
  type TrackFileStamp,
  type TrackRow,
} from '../db/library.js';
import { db } from '../db/connection.js';
import { persistArtwork } from './artworkIngest.js';
import { AUDIO_EXTENSIONS, extractTrackTags, type TrackTags } from './trackTags.js';

export interface ScanFailure {
  path: string;
  error: string;
}

export interface ScanSummary {
  filesFound: number;
  filesAdded: number;
  filesUpdated: number;
  /** Skipped: size, mtime and scanner version all matched the row, so the tags were not read. */
  filesUnchanged: number;
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

/** Where scan problems are reported; defaults to the console. */
export type ScanLogger = { warn: (msg: string) => void; info: (msg: string) => void };

const consoleLogger: ScanLogger = { warn: (msg) => console.error(msg), info: (msg) => console.log(msg) };

type ScanFileResult = { status: 'added' | 'updated' | 'unchanged' } | { status: 'failed'; error: string };

/**
 * Stored on each track a scan reads. Bump it when `extractTrackTags` starts reading something new (as genres did in
 * 0032): rows below it no longer match, so the next scan reads every file once.
 */
export const SCANNER_VERSION = 1;

type FileRead =
  | { status: 'unchanged' }
  | { status: 'failed'; error: string }
  | { status: 'read'; fileSize: number; fileMtime: number; tags: TrackTags };

/** The async half of a file's scan: stat, and tags unless the stamp says nothing changed. Writes nothing. */
async function readFile(filePath: string, log: ScanLogger, stamp: TrackFileStamp | undefined): Promise<FileRead> {
  try {
    const stats = await stat(filePath);
    const fileMtime = Math.floor(stats.mtimeMs);
    if (
      stamp &&
      stamp.file_size === stats.size &&
      stamp.file_mtime === fileMtime &&
      stamp.scan_version === SCANNER_VERSION
    ) {
      return { status: 'unchanged' };
    }

    return { status: 'read', fileSize: stats.size, fileMtime, tags: await extractTrackTags(filePath) };
  } catch (err) {
    return failed(filePath, err, log);
  }
}

function failed(filePath: string, err: unknown, log: ScanLogger): { status: 'failed'; error: string } {
  const message = err instanceof Error ? err.message : String(err);
  log.warn(`Failed to scan ${filePath}: ${message}`);
  return { status: 'failed', error: message };
}

/**
 * Writes a batch of read files in one transaction. Each commit costs an fsync, about 100 ms on the dev WSL2 disk
 * (measured 2026-10-20), and a track takes several writes; one commit per batch is most of the scan's speed.
 * A file whose write throws is rolled back alone (savepoint) and reported failed; the rest of the batch commits.
 */
function writeBatch(
  batch: readonly { filePath: string; read: FileRead }[],
  rootId: number,
  log: ScanLogger,
): Array<{ result: ScanFileResult; track?: TrackRow; picture?: TrackTags['picture'] }> {
  const writeOne = db.transaction((filePath: string, read: Extract<FileRead, { status: 'read' }>) => {
    const existed = Boolean(findTrackByPath(filePath));
    const track = upsertTrack({
      path: filePath,
      fileSize: read.fileSize,
      rootId,
      fileMtime: read.fileMtime,
      scanVersion: SCANNER_VERSION,
      ...read.tags,
    });
    return { existed, track };
  });

  return db.transaction(() =>
    batch.map(({ filePath, read }) => {
      if (read.status !== 'read') return { result: read };
      try {
        const { existed, track } = writeOne(filePath, read);
        return { result: { status: existed ? 'updated' : 'added' } as const, track, picture: read.tags.picture };
      } catch (err) {
        return { result: failed(filePath, err, log) };
      }
    }),
  )();
}

/** After each file; `processed` includes it. Files run concurrently, so calls arrive in completion order. */
export type ScanProgressCallback = (processed: number, total: number) => void;

/** Files scanned at once. Tag parsing is I/O-bound but heavier than a stat, hence lower than reconcile's batch. */
const SCAN_CONCURRENCY = 6;

/** Files written per transaction. Read results, embedded pictures included, are held in memory until their batch commits. */
const WRITE_BATCH = 32;

/** Runs `fn` over `items`, at most `width` at a time, keeping order. */
async function inChunks<T, R>(items: readonly T[], width: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += width) out.push(...(await Promise.all(items.slice(i, i + width).map(fn))));
  return out;
}

/**
 * Walks `libraryRoot`, reads tags and upserts each file by path; bad files are logged and skipped. A file unchanged
 * since its last read is skipped unless `full` is set. The root is a parameter so the walked directory is visible at
 * the call site. `onProgress` feeds librarySync's progress.
 */
export async function scanLibrary(
  libraryRoot: string,
  rootId: number,
  artworkRoot: string,
  onProgress?: ScanProgressCallback,
  log: ScanLogger = consoleLogger,
  options: { full?: boolean } = {},
): Promise<ScanSummary> {
  const start = Date.now();

  const { files, unreadableDirs } = await findAudioFiles(libraryRoot);
  const albumsBefore = albumIdsByTrack(rootId);
  const stamps = options.full ? new Map<string, TrackFileStamp>() : listTrackFileStamps(rootId);

  let filesAdded = 0;
  let filesUpdated = 0;
  let filesUnchanged = 0;
  const failures: ScanFailure[] = [];

  let processed = 0;

  for (let i = 0; i < files.length; i += WRITE_BATCH) {
    const batch = files.slice(i, i + WRITE_BATCH);
    const reads = await inChunks(batch, SCAN_CONCURRENCY, (filePath) => readFile(filePath, log, stamps.get(filePath)));
    const written = writeBatch(batch.map((filePath, index) => ({ filePath, read: reads[index] })), rootId, log);
    // Artwork writes files, so it runs after the commit; a failure here never fails the track.
    await inChunks(written, SCAN_CONCURRENCY, async ({ track, picture }) => {
      if (track) await persistArtwork(artworkRoot, track.id, track.album_id, picture ?? null);
    });

    batch.forEach((filePath, index) => {
      const { result } = written[index];
      if (result.status === 'failed') {
        failures.push({ path: filePath, error: result.error });
      } else if (result.status === 'added') {
        filesAdded++;
      } else if (result.status === 'unchanged') {
        filesUnchanged++;
      } else {
        filesUpdated++;
      }
      onProgress?.(++processed, files.length);
    });
  }

  const settled = settleAlbums(albumsBefore);
  if (settled.artistsSet > 0 || settled.merged > 0) {
    log.info(`Albums settled: ${settled.artistsSet} artist(s) worked out from tracks, ${settled.merged} merged`);
  }

  return {
    filesFound: files.length,
    filesAdded,
    filesUpdated,
    filesUnchanged,
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
