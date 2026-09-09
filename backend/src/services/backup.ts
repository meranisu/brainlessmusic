import { mkdirSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { getDb } from '../db/connection.js';

/**
 * Scheduled SQLite backups (roadmap step 14).
 *
 * Playlists, favorites and play history are the only irreplaceable rows in
 * this database — tracks, artists, albums and artwork are all derived from
 * files on disk and a re-scan rebuilds them. That data is small and grows
 * every evening someone listens, which makes it exactly the kind of thing
 * that is cheap to protect now and impossible to recover later.
 *
 * Two things here are deliberate:
 *
 *  - **`db.backup()`, never a file copy.** The database runs in WAL mode, so
 *    `cp brainlessmusic.db backup.db` can capture a file whose committed
 *    pages are still sitting in the `-wal` sidecar. The result looks like a
 *    database and opens fine, and is missing recent transactions or is
 *    outright corrupt. SQLite's online backup API copies a consistent
 *    snapshot while the server keeps serving.
 *
 *  - **Every backup is verified before it counts.** A backup nobody has read
 *    back is a guess. Each new file is reopened and `PRAGMA integrity_check`
 *    run against it, so a corrupt one is reported as a failure now rather
 *    than discovered on the worst day.
 */

const FILE_PREFIX = 'brainlessmusic-';
const FILE_SUFFIX = '.db';
/** `brainlessmusic-2026-09-09T14-31-07.db` — sorts chronologically as text. */
const FILE_PATTERN = /^brainlessmusic-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/;

export interface BackupResult {
  path: string;
  bytes: number;
  /** How many older backups were deleted to honour the retention limit. */
  pruned: number;
}

function timestampFor(date: Date): string {
  // ISO-8601 with the characters a filesystem dislikes swapped out, keeping
  // lexical order equal to chronological order so a plain sort is enough.
  return date.toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-');
}

/**
 * Copies the live database to a timestamped file and verifies it opens clean.
 * Safe to call while the server is serving requests.
 */
export async function backupDatabase(
  destinationDir = config.backupPath,
  now = new Date(),
): Promise<BackupResult> {
  mkdirSync(destinationDir, { recursive: true });

  const path = join(destinationDir, `${FILE_PREFIX}${timestampFor(now)}${FILE_SUFFIX}`);
  await getDb().backup(path);

  const copy = new Database(path);
  try {
    // The backup inherits WAL mode from the live database, which would leave
    // `-wal`/`-shm` sidecars beside every backup. Switching the copy to
    // `delete` folds them back in, so each backup is exactly one
    // self-contained file. That matters for restoring: dropping a `.db` next
    // to a stale `-wal` from a different database is a well-known way to
    // corrupt it, and a single file makes that mistake impossible.
    copy.pragma('journal_mode = delete');

    // Read it back before calling it a backup.
    const result = copy.pragma('integrity_check', { simple: true });
    if (result !== 'ok') {
      throw new Error(`backup failed its integrity check: ${String(result)}`);
    }
  } finally {
    copy.close();
  }

  const { size } = await stat(path);
  const pruned = await pruneBackups(destinationDir, config.backupKeep);
  return { path, bytes: size, pruned };
}

/**
 * Deletes the oldest backups beyond `keep`. Only files this module created are
 * considered — anything else in the directory is left alone, so pointing
 * `BACKUP_PATH` somewhere shared cannot delete a stranger's files.
 */
export async function pruneBackups(directory: string, keep: number): Promise<number> {
  if (keep <= 0) return 0;

  const entries = await readdir(directory);
  const ours = entries.filter((name) => FILE_PATTERN.test(name)).sort();
  const doomed = ours.slice(0, Math.max(0, ours.length - keep));

  for (const name of doomed) {
    await unlink(join(directory, name));
  }
  return doomed.length;
}

/** Backups this module can see, oldest first. */
export async function listBackups(directory = config.backupPath): Promise<string[]> {
  try {
    const entries = await readdir(directory);
    return entries.filter((name) => FILE_PATTERN.test(name)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

/**
 * Runs a backup now, then every `backupIntervalHours`.
 *
 * A failure is logged and the schedule continues: a server that stops serving
 * music because it could not write a backup file has traded a small problem
 * for a large one. The timer is `unref`'d so it never holds the process open.
 */
export function startBackupSchedule(log: Logger): NodeJS.Timeout | null {
  if (!config.backupEnabled) {
    log.info('Database backups are disabled (BACKUP_ENABLED=false).');
    return null;
  }

  const run = () => {
    backupDatabase().then(
      ({ path, bytes, pruned }) =>
        log.info(
          `Database backed up to ${path} (${Math.round(bytes / 1024)} KB)` +
            (pruned > 0 ? `, pruned ${pruned} older backup${pruned === 1 ? '' : 's'}` : ''),
        ),
      (err: unknown) =>
        log.error(`Database backup failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  };

  run();
  const timer = setInterval(run, config.backupIntervalHours * 60 * 60 * 1000);
  timer.unref();
  return timer;
}
