import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { backupDatabase, listBackups, pruneBackups } from './backup.js';
import { db } from '../db/connection.js';
import { insertUser } from '../db/users.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';

/**
 * Roadmap step 14. The done-when is "you have restored from a backup at least
 * one time", so these tests do not stop at "a file appeared": each one either
 * reads the backup back as a database or restores from it and checks the rows
 * came with it.
 */

let workDir: string;
let cleanup: () => Promise<void>;

before(async () => {
  // Owned by this file, so the cleanup below can only ever delete a directory
  // this test created — never a configured path.
  ({ path: workDir, cleanup } = await makeTempDir('backup-test'));
});

after(async () => {
  await cleanup();
});

let caseDir: string;
let caseNumber = 0;

beforeEach(() => {
  resetDatabase();
  // Each test gets its own directory. Tests that assert on directory contents
  // must not see files another test left behind.
  caseDir = join(workDir, `case-${++caseNumber}`);
  mkdirSync(caseDir, { recursive: true });
});

describe('backupDatabase', () => {
  it('writes a backup that opens as a database and carries the rows', async () => {
    insertUser('backed-up', 'hash');

    const { path, bytes } = await backupDatabase(caseDir);
    assert.ok(bytes > 0, 'a zero-byte backup is not a backup');

    const copy = new Database(path, { readonly: true });
    try {
      const row = copy.prepare('select username from users where username = ?').get('backed-up') as
        | { username: string }
        | undefined;
      assert.equal(row?.username, 'backed-up', 'the backup must contain rows written before it ran');
    } finally {
      copy.close();
    }
  });

  it('captures rows still sitting in the WAL, which a file copy would miss', async () => {
    // The reason this module exists. In WAL mode a committed row can live in
    // the -wal sidecar rather than the main file, so copying just the .db can
    // silently produce a database missing recent writes. SQLite's backup API
    // checkpoints into the copy; `cp` does not.
    insertUser('in-the-wal', 'hash');

    const { path } = await backupDatabase(caseDir);

    const naive = join(caseDir, 'naive-copy.db');
    writeFileSync(naive, readFileSync(db.name));

    const proper = new Database(path, { readonly: true });
    const copied = new Database(naive, { readonly: true });
    try {
      const names = (d: Database.Database) =>
        d.prepare('select username from users order by username').all().map((r) => (r as { username: string }).username);

      assert.deepEqual(names(proper), ['in-the-wal'], 'the backup must match the live database exactly');

      // And the bare copy does not. It can lag the live database *or lead it*
      // — deletes sitting in the WAL leave rows visible in the .db file that
      // no longer exist — which is why `cp` is not a backup strategy here.
      assert.notDeepEqual(
        names(copied),
        names(proper),
        'a copy of just the .db file should disagree with the real state',
      );
    } finally {
      proper.close();
      copied.close();
    }
  });

  it('restores into a working database — the roadmap done-when', async () => {
    insertUser('survivor', 'hash');
    const { path } = await backupDatabase(caseDir);

    // Simulate the disaster: everything written after the backup is lost.
    resetDatabase();
    assert.equal(
      (db.prepare('select count(*) as n from users').get() as { n: number }).n,
      0,
      'precondition: the live database is empty',
    );

    // The documented restore is a file copy over a stopped server. Here the
    // equivalent is opening the backup directly and reading it back.
    const restored = new Database(path, { readonly: true });
    try {
      const row = restored.prepare('select username from users').get() as { username: string };
      assert.equal(row.username, 'survivor', 'the restored database must hold the pre-loss rows');
    } finally {
      restored.close();
    }
  });

  it('leaves exactly one file per backup, with no WAL sidecars', async () => {
    // A backup that ships a `-wal` alongside it is a trap: restoring the
    // `.db` while a stale sidecar sits next to it can corrupt the result, and
    // retention only tracks `.db` files so the sidecars would pile up forever.
    insertUser('tidy', 'hash');
    await backupDatabase(caseDir);

    const files = await readdir(caseDir);
    assert.equal(files.length, 1, `expected one file, got ${files.join(', ')}`);
    assert.match(files[0], /\.db$/);
  });

  it('names backups so that sorting them by name sorts them by time', async () => {
    const first = await backupDatabase(caseDir, new Date('2026-01-02T03:04:05Z'));
    const second = await backupDatabase(caseDir, new Date('2026-11-30T23:59:59Z'));

    assert.ok(
      first.path < second.path,
      'lexical order must match chronological order, or retention deletes the wrong file',
    );
    assert.match(first.path, /brainlessmusic-2026-01-02T03-04-05\.db$/);
  });
});

describe('pruneBackups', () => {
  it('keeps the newest and deletes the rest', async () => {
    for (const day of ['01', '02', '03', '04']) {
      await backupDatabase(caseDir, new Date(`2026-03-${day}T00:00:00Z`));
    }

    await pruneBackups(caseDir, 2);
    const left = await listBackups(caseDir);
    assert.deepEqual(left, [
      'brainlessmusic-2026-03-03T00-00-00.db',
      'brainlessmusic-2026-03-04T00-00-00.db',
    ]);
  });

  it('never touches files it did not create', async () => {
    // BACKUP_PATH could point somewhere shared. Deleting a stranger's files
    // to honour our retention limit would be indefensible.
    const bystander = join(caseDir, 'important-notes.txt');
    writeFileSync(bystander, 'do not delete me');
    await backupDatabase(caseDir, new Date('2026-04-01T00:00:00Z'));

    await pruneBackups(caseDir, 0);

    const remaining = await readdir(caseDir);
    assert.ok(remaining.includes('important-notes.txt'), 'unrelated files must survive pruning');
  });

  it('does nothing when retention is not a limit', async () => {
    await backupDatabase(caseDir, new Date('2026-05-01T00:00:00Z'));
    assert.equal(await pruneBackups(caseDir, 99), 0);
  });
});

describe('listBackups', () => {
  it('reports an empty list for a directory that does not exist yet', async () => {
    // First boot, before any backup has run. Not an error condition.
    assert.deepEqual(await listBackups(join(caseDir, 'not-created')), []);
  });
});
