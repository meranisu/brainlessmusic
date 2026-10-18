import { mkdirSync } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { getDb } from '../db/connection.js';

/**
 * Scheduled SQLite backups (step 14) of the only irreplaceable rows: playlists, favorites, history. Uses `db.backup()`,
 * never a file copy (WAL), and runs `PRAGMA integrity_check` on each new file before it counts.
 */

const FILE_PREFIX = 'brainlessmusic-';
const FILE_SUFFIX = '.db';
/** `brainlessmusic-2026-09-09T14-31-07.db`, which sorts chronologically as text. */
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

/** Copies the live database to a timestamped file and verifies it. Safe while serving. */
export async function backupDatabase(
  destinationDir: string,
  now = new Date(),
): Promise<BackupResult> {
  mkdirSync(destinationDir, { recursive: true });

  const path = join(destinationDir, `${FILE_PREFIX}${timestampFor(now)}${FILE_SUFFIX}`);
  await getDb().backup(path);

  const copy = new Database(path);
  try {
    // Switch the copy out of WAL so each backup is one file; a `.db` restored beside a stale `-wal` can corrupt.
    copy.pragma('journal_mode = delete');

    // Read it back before calling it a backup.
    const result = copy.pragma('integrity_check', { simple: true });
    if (result !== 'ok') {
      throw new Error(`backup failed its integrity check: ${String(result)}`);
    }
  } catch (err) {
    // A bad file still matches FILE_PATTERN, so it would count toward `backupKeep` and push out a good backup.
    copy.close();
    await unlink(path).catch(() => {});
    throw err;
  }
  copy.close();

  const { size } = await stat(path);
  const pruned = await pruneBackups(destinationDir, config.backupKeep);
  return { path, bytes: size, pruned };
}

/** Deletes backups beyond `keep`, touching only files this module named, so a shared `BACKUP_PATH` is safe. */
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
export async function listBackups(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory);
    return entries.filter((name) => FILE_PATTERN.test(name)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

type Logger = { info: (msg: string) => void; error: (msg: string) => void };

/** Backs up now, then every `backupIntervalHours`. Failures are logged and the schedule goes on. `unref`'d. */
export function startBackupSchedule(log: Logger): NodeJS.Timeout | null {
  if (!config.backupEnabled) {
    log.info('Database backups are disabled (BACKUP_ENABLED=false).');
    return null;
  }

  const run = () => {
    backupDatabase(config.backupPath).then(
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
