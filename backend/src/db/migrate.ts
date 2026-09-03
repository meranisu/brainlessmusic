import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

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

for (const file of files) {
  if (applied.has(file)) continue;

  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  db.exec(sql);
  db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(file);
  console.log(`Applied migration: ${file}`);
}

console.log('Migrations up to date.');
