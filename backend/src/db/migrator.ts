import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface MigrationOptions {
  /** No per-migration logging; the test harness runs this before every suite. */
  silent?: boolean;
}

/** Applies every migration not in `schema_migrations`, in filename order. Shared by the CLI and the tests. */
export function runMigrations({ silent = false }: MigrationOptions = {}): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map((row) => row.id),
  );

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;

    db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(file);
    newlyApplied.push(file);
    if (!silent) console.log(`Applied migration: ${file}`);
  }

  return newlyApplied;
}
