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

    const track = upsertTrack({
      path: filePath,
      fileSize: stats.size,
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

/**
 * Walks `libraryRoot` for supported audio files, reads tags via
 * music-metadata, and upserts each into the DB by path. Per-file failures
 * (corrupt/unparseable files) are logged and skipped rather than aborting
 * the whole scan.
 *
 * The root is a parameter rather than a read of `config.libraryPath` so the
 * directory being walked is visible at the call site — see the note on
 * `fileIntoLibrary`.
 */
export async function scanLibrary(libraryRoot: string): Promise<ScanSummary> {
  const start = Date.now();

  const files = await findAudioFiles(libraryRoot);

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
 */
export async function reconcileMissingTracks(
  libraryRoot: string,
  options: { abortRatio?: number; now?: Date } = {},
): Promise<ReconcileSummary> {
  const start = Date.now();
  const abortRatio = options.abortRatio ?? 0.5;
  const at = (options.now ?? new Date()).toISOString();

  const rows = listTrackPaths();
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
