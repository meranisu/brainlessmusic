import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { makeTempDir, resetDatabase } from '../testing/harness.js';
import { db } from './connection.js';
import { runMigrations } from './migrator.js';

function columnsOf(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function recorded(id: string): boolean {
  return db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(id) !== undefined;
}

describe('runMigrations (C22)', () => {
  it('leaves nothing behind when a migration fails halfway, so the next run can apply it', async () => {
    resetDatabase();
    const dir = await makeTempDir('migrator');
    try {
      const file = '9001_half_fails.sql';
      await writeFile(
        join(dir.path, file),
        'ALTER TABLE users ADD COLUMN c22_probe TEXT;\nINSERT INTO no_such_table VALUES (1);\n',
      );

      assert.throws(() => runMigrations({ silent: true, dir: dir.path }));
      assert.ok(!columnsOf('users').includes('c22_probe'), 'the ALTER before the failure is rolled back');
      assert.ok(!recorded(file));

      // Fixed, it applies cleanly instead of failing on a duplicate column.
      await writeFile(join(dir.path, file), 'ALTER TABLE users ADD COLUMN c22_probe TEXT;\n');
      assert.deepEqual(runMigrations({ silent: true, dir: dir.path }), [file]);
      assert.ok(columnsOf('users').includes('c22_probe'));
    } finally {
      db.prepare("DELETE FROM schema_migrations WHERE id LIKE '9001_%'").run();
      if (columnsOf('users').includes('c22_probe')) db.exec('ALTER TABLE users DROP COLUMN c22_probe');
      await dir.cleanup();
    }
  });

  it('still runs a migration that opens its own transaction', async () => {
    resetDatabase();
    const dir = await makeTempDir('migrator');
    try {
      const file = '9002_own_transaction.sql';
      await writeFile(join(dir.path, file), 'BEGIN;\nCREATE TABLE c22_own (id INTEGER);\nCOMMIT;\n');
      assert.deepEqual(runMigrations({ silent: true, dir: dir.path }), [file]);
      assert.ok(recorded(file));
    } finally {
      db.prepare("DELETE FROM schema_migrations WHERE id LIKE '9002_%'").run();
      db.exec('DROP TABLE IF EXISTS c22_own');
      await dir.cleanup();
    }
  });
});
