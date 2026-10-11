import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** A top-level `BEGIN;` line, not a trigger body's `... BEGIN` at the end of a line. */
const OWN_TRANSACTION = /^\s*BEGIN(\s+TRANSACTION)?\s*;/im;

export interface MigrationOptions {
  /** No per-migration logging; the test harness runs this before every suite. */
  silent?: boolean;
  /** Where the `.sql` files are. Tests only; the server always uses `migrations/`. */
  dir?: string;
}

/** Applies every migration not in `schema_migrations`, in filename order. Shared by the CLI and the tests. */
export function runMigrations({ silent = false, dir = migrationsDir }: MigrationOptions = {}): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map((row) => row.id),
  );

  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(dir, file), 'utf8');
    const record = () => db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(file);
    if (OWN_TRANSACTION.test(sql)) {
      // It opens its own transaction (0017), which can't nest inside ours.
      db.exec(sql);
      record();
    } else {
      // All or nothing, record included: a migration that fails halfway (an ALTER, then a statement that errors) used
      // to leave its first half applied and unrecorded, so the next run failed on "duplicate column" for good (C22).
      db.transaction(() => {
        db.exec(sql);
        record();
      })();
    }
    newlyApplied.push(file);
    if (!silent) console.log(`Applied migration: ${file}`);
  }

  return newlyApplied;
}
