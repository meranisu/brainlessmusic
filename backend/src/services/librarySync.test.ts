import assert from 'node:assert/strict';
import { config } from '../config.js';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { findLibraryRootById, insertLibraryRoot } from '../db/libraryRoots.js';
import { upsertTrack } from '../db/library.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';
import { isScanDue, syncLibrary } from './librarySync.js';

describe('syncLibrary', () => {
  beforeEach(() => {
    resetDatabase();
  });

  /** Regression: rescanning a root whose folder vanished threw ENOENT (a 500). Needs a track under the root to reproduce. */
  it('does not throw when scanning a root whose directory has vanished entirely', async () => {
    const temp = await makeTempDir('sync-vanish');
    const rootPath = join(temp.path, 'drive');
    await mkdir(rootPath, { recursive: true });

    const root = insertLibraryRoot(rootPath, null);
    upsertTrack({
      path: join(rootPath, 'a.mp3'),
      title: 'A',
      artistName: null,
      albumTitle: null,
      albumYear: null,
      trackNumber: null,
      duration: 1,
      format: 'MP3',
      fileSize: 16,
      rootId: root.id,
    });

    // The whole drive, not just the one file.
    await rm(rootPath, { recursive: true, force: true });

    const result = await syncLibrary(rootPath, root.id, config.artworkPath, { scan: true });

    assert.ok(result, 'a fresh call must not be turned away as already-running');
    assert.equal(result!.scan, undefined, 'no scan summary is attempted when the root cannot be read');
    assert.ok(result!.reconcile.aborted, 'the vanished root must be reported, not silently swallowed');

    await temp.cleanup();
  });
});

describe('isScanDue (0033)', () => {
  const now = new Date('2026-10-12T12:00:00Z');

  it('is due when never scanned', () => {
    assert.equal(isScanDue(null, now, 12), true);
  });

  it('reads SQLite UTC timestamps and compares against the interval', () => {
    assert.equal(isScanDue('2026-10-12 00:00:00', now, 12), true, 'exactly 12 h ago');
    assert.equal(isScanDue('2026-10-12 00:00:01', now, 12), false, 'a second short');
    assert.equal(isScanDue('2026-10-11 09:00:00', now, 12), true);
  });

  it('treats an unreadable stamp as due rather than never scanning again', () => {
    assert.equal(isScanDue('not a date', now, 12), true);
  });
});

describe('last_full_scan_at', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('is stamped by a scan and not by a reconcile-only pass', async () => {
    const temp = await makeTempDir('sync-stamp');
    try {
      const root = insertLibraryRoot(temp.path, null);

      await syncLibrary(temp.path, root.id, config.artworkPath);
      assert.equal(findLibraryRootById(root.id)!.last_full_scan_at, null, 'reconcile only');
      assert.ok(findLibraryRootById(root.id)!.last_scanned_at, 'reconcile still stamps last_scanned_at');

      await syncLibrary(temp.path, root.id, config.artworkPath, { scan: true });
      assert.ok(findLibraryRootById(root.id)!.last_full_scan_at);
    } finally {
      await temp.cleanup();
    }
  });
});
