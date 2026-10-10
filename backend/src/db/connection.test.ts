import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { describe, it } from 'node:test';
import '../testing/harness.js'; // refuses to run outside the isolated test env
import { config } from '../config.js';

/** Importing `db/` must not open (or create) a database. */
describe('lazy database connection', () => {
  it('does not open a connection merely by being imported', async () => {
    const { isDatabaseOpen } = await import('./connection.js');
    assert.equal(
      isDatabaseOpen(),
      false,
      'importing db/connection.js must not open a handle',
    );
  });

  it('does not open a connection when a db module is imported', async () => {
    const { isDatabaseOpen } = await import('./connection.js');

    // plays.ts used to build its transaction at module scope, which opened the
    // connection as a side effect of importing it.
    await import('./plays.js');
    await import('./users.js');
    await import('./library.js');
    await import('./browse.js');

    assert.equal(isDatabaseOpen(), false, 'importing db modules must not open a handle');
  });

  it('creates nothing on disk until something actually queries', async () => {
    const { closeDb, getDb, isDatabaseOpen } = await import('./connection.js');

    closeDb();
    rmSync(config.dbPath, { force: true });
    rmSync(`${config.dbPath}-wal`, { force: true });
    rmSync(`${config.dbPath}-shm`, { force: true });

    assert.equal(existsSync(config.dbPath), false, 'precondition: no database file');
    assert.equal(isDatabaseOpen(), false);

    getDb();

    assert.equal(isDatabaseOpen(), true, 'the first access opens it');
    assert.equal(existsSync(config.dbPath), true, 'and only then does the file appear');
  });

  it('hands back one shared connection, not a new one per access', async () => {
    const { getDb } = await import('./connection.js');
    assert.equal(getDb(), getDb());
  });

  it('proxies method calls with the right receiver', async () => {
    // better-sqlite3 methods break with a detached `this`, so the proxy must bind them.
    const { db } = await import('./connection.js');
    const row = db.prepare('SELECT 1 AS one').get() as { one: number };
    assert.equal(row.one, 1);
    assert.equal(typeof db.pragma('journal_mode'), 'object');
  });
});
