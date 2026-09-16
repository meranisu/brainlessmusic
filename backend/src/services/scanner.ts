import { readdir, stat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import {
  clearTracksMissing,
  findTrackByPath,
  listTrackPaths,
  markTracksMissing,
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
  /** Subdirectories skipped because they couldn't be read — a Windows drive's
   *  own `System Volume Information`/`$RECYCLE.BIN`, or anything else this
   *  container's user lacks permission for. Not fatal to the scan; see
   *  `findAudioFiles`. */
  unreadableDirs: number;
  durationMs: number;
  failures: ScanFailure[];
}

/**
 * Walked by hand, one directory at a time, rather than a single
 * `readdir(root, { recursive: true })` — that form is all-or-nothing, and a
 * single unreadable subdirectory anywhere in the tree (a Windows drive's own
 * `System Volume Information` and `$RECYCLE.BIN` are both locked down by
 * permissions the container's user doesn't have, confirmed the hard way once
 * `/mnt` started being mountable whole) would throw and abort scanning the
 * entire drive instead of just skipping the one folder it can't see into.
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

/** Called after each file is processed — `processed` includes the one that
 *  just finished, so `processed === total` means the scan's file loop is
 *  about to return. Files run concurrently (see `SCAN_CONCURRENCY`), so calls
 *  land in completion order, not the order `files` was walked in. */
export type ScanProgressCallback = (processed: number, total: number) => void;

/**
 * Each `scanFile` is I/O-bound — a `stat`, a `music-metadata` parse, and
 * (when the file has a cover) an artwork write — so running them one at a
 * time pays full round-trip latency per file for no reason. This mirrors the
 * batching `reconcileMissingTracks` already does for its own I/O-bound sweep,
 * just with a lower cap: parsing a file's tags is heavier than a bare `stat`,
 * so a higher number buys less overlap while costing more memory and fd
 * pressure from files mid-parse at once.
 */
const SCAN_CONCURRENCY = 6;

/**
 * Walks `libraryRoot` for supported audio files, reads tags via
 * music-metadata, and upserts each into the DB by path. Per-file failures
 * (corrupt/unparseable files) are logged and skipped rather than aborting
 * the whole scan.
 *
 * The root is a parameter rather than a read of `config.libraryPath` so the
 * directory being walked is visible at the call site — see the note on
 * `fileIntoLibrary`. `rootId` is which `library_roots` row this walk belongs
 * to, so every file it finds can be attributed back to it.
 *
 * `onProgress` is optional and fire-and-forget from this function's own
 * point of view — it exists so a caller (`librarySync.ts`) can expose *some*
 * live signal for what would otherwise be a single opaque await, not because
 * this function has any use for the number itself.
 */
export async function scanLibrary(
  libraryRoot: string,
  rootId: number,
  onProgress?: ScanProgressCallback,
): Promise<ScanSummary> {
  const start = Date.now();

  const { files, unreadableDirs } = await findAudioFiles(libraryRoot);

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
  /**
   * Missing rows whose path is not under `libraryRoot` at all — leftovers from
   * a library that used to live somewhere else. No scan of the current root
   * can ever heal these, so they are worth calling out separately from a file
   * that was simply deleted.
   */
  strandedOutsideRoot: number;
  /** Paths that exist but could not be read (permissions, I/O). Never marked. */
  unreadable: number;
  /** Set when the guard refused to mark anything, and why. */
  aborted?: string;
  durationMs: number;
}

/** Enough parallelism to hide I/O latency, few enough to not exhaust fds. */
const STAT_CONCURRENCY = 32;

/**
 * The guard needs an absolute floor as well as a ratio, or it protects small
 * libraries into uselessness: in a three-track library a single deleted file
 * is 33% and in a two-track library it is 50%, so a plain ratio would refuse
 * to record ordinary deletions on exactly the libraries where they are most
 * obvious. Below this count the ratio is not consulted — and it costs little,
 * because marking is reversible and self-healing, so being wrong about two
 * tracks is a flag that clears itself on the next sweep.
 */
const GUARD_MIN_NEWLY_MISSING = 3;

async function pathIsMissing(path: string): Promise<'present' | 'missing' | 'unreadable'> {
  try {
    await stat(path);
    return 'present';
  } catch (err) {
    // Only "it is not there" counts. A permissions or I/O error means the file
    // may well exist and we simply cannot see it, and marking on that would
    // turn a mount hiccup into a library full of false gravestones.
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'unreadable';
  }
}

/**
 * Checks every track row against the filesystem and reconciles the
 * `missing_since` flag: stamped when a file has gone, cleared when it returns.
 *
 * It marks, it never deletes. The rows this exists to catch on the real
 * database point at `/mnt/wsl/music`, a tmpfs library root that was lost —
 * deleting them would take favorites and playlist entries with them, for files
 * that may still exist in a backup or on another disk. Flagging is reversible.
 *
 * **The guard is the point of the function, not a detail.** A library on a
 * mount that has not come up yet looks exactly like a library that was
 * deleted, and this project has already destroyed its music once by acting on
 * that ambiguity. So a sweep that would newly condemn both more than
 * `abortRatio` of the library and at least `GUARD_MIN_NEWLY_MISSING` tracks
 * refuses and changes nothing, on the grounds that losing half a library at
 * once is an infrastructure failure rather than someone tidying up. The next
 * sweep, once the mount is back, is a no-op.
 *
 * `rootId` scopes the guard and the set of rows judged to this root's own
 * tracks — with more than one root registered, a healthy root's ratio must
 * not be diluted (or tripped) by every other root's track count.
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
      aborted: `library root is unreadable (${libraryRoot}) — nothing was marked`,
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
        `${Math.round(abortRatio * 100)}% limit — treating this as a storage failure, not a ` +
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
