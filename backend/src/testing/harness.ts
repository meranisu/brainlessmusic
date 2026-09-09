import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../db/connection.js';
import { runMigrations } from '../db/migrator.js';

/**
 * Shared setup for tests that touch the database.
 *
 * The `npm test` script points DB_PATH, LIBRARY_PATH, ARTWORK_PATH and
 * UPLOAD_STAGING_PATH at `backend/.test-tmp/`, so no test can reach the real
 * library or database no matter what it imports. That matters more than it
 * sounds: `db/connection.ts` opens a database as a side effect of being
 * imported, so merely importing a module that transitively reaches `db/` is
 * enough to touch whatever DB_PATH points at. This has bitten the project
 * before (see .docs/CHANGELOG.md, 2026-09-08, cover art).
 */

/** Child rows first — foreign keys are enforced (`better-sqlite3` enables them by default). */
const TABLES_IN_DELETION_ORDER = [
  'play_history',
  'favorites',
  'playlist_tracks',
  'playlists',
  'tracks',
  'albums',
  'artists',
  'users',
];

let schemaReady = false;

/** Applies migrations once per process, then empties every table. */
export function resetDatabase(): void {
  if (!schemaReady) {
    runMigrations({ silent: true });
    schemaReady = true;
  }

  db.exec(TABLES_IN_DELETION_ORDER.map((table) => `DELETE FROM ${table};`).join('\n'));
}

/** A scratch directory outside the repository, removed by the returned cleanup. */
export async function makeTempDir(prefix: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const path = await mkdtemp(join(tmpdir(), `brainlessmusic-${prefix}-`));
  return { path, cleanup: () => rm(path, { recursive: true, force: true }) };
}

/**
 * Fails the run when the isolated test environment is not in force.
 *
 * Imported for its side effect at the top of every suite that touches the
 * database or the filesystem, so that running a file directly with
 * `tsx --test` — bypassing the paths `npm test` sets — stops immediately
 * instead of operating on the real library or database.
 *
 * This is not theoretical. On 2026-09-09 a version of `trackFiling.test.ts`
 * that deleted `config.libraryPath` was run directly, resolved LIBRARY_PATH to
 * the real music library, and destroyed it. The guard existed at the time and
 * was simply never called. It is now enforced at import, not by remembering.
 */
export function assertIsolatedEnvironment(): void {
  const offenders = (
    [
      ['DB_PATH', process.env.DB_PATH],
      ['LIBRARY_PATH', process.env.LIBRARY_PATH],
      ['ARTWORK_PATH', process.env.ARTWORK_PATH],
      ['UPLOAD_STAGING_PATH', process.env.UPLOAD_STAGING_PATH],
    ] as const
  ).filter(([, value]) => !(value ?? '').includes('.test-tmp'));

  if (offenders.length > 0) {
    const listed = offenders.map(([name, value]) => `  ${name}=${value ?? '(unset)'}`).join('\n');
    throw new Error(
      'Refusing to run: the isolated test environment is not in force. These point outside ' +
        `backend/.test-tmp/ and may be real data:\n${listed}\n` +
        'Run the suite with `npm test`, which sets every path to a throwaway location.',
    );
  }
}

// Enforced on import, so a suite cannot forget to call it.
assertIsolatedEnvironment();
