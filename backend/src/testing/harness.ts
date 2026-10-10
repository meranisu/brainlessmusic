import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../db/connection.js';
import { runMigrations } from '../db/migrator.js';

/**
 * Shared setup for database tests. `npm test` points every path at `backend/.test-tmp/`, so no import can reach the
 * real library or database.
 */

/** Child rows first: foreign keys are enforced. */
const TABLES_IN_DELETION_ORDER = [
  'guest_code_signins',
  'guest_code_requests',
  'guest_codes',
  'server_settings',
  'playback_failures',
  'scan_failures',
  'play_history',
  'favorites',
  'less_often',
  'playback_state',
  'playlist_tracks',
  'playlists',
  'tracks',
  'library_roots',
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
 * Fails fast outside `npm test`'s isolated paths. Imported by every suite that touches the db or disk, since a direct
 * `tsx --test` run destroyed the real library on 2026-09-09.
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
