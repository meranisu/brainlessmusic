import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { upsertTrack } from '../db/library.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';
import { syncLibrary } from './librarySync.js';

describe('syncLibrary', () => {
  beforeEach(() => {
    resetDatabase();
  });

  /**
   * Regression: found by hand while testing the multi-root feature — asking
   * to rescan a root whose folder had been entirely removed (a drive
   * unplugged, not just one file gone) threw an uncaught `ENOENT` straight
   * out of `scanLibrary`'s `readdir`, a 500 rather than the same graceful
   * "unreadable" outcome `reconcileMissingTracks` already handles on its own.
   * A root with zero tracks can't reproduce this — `reconcileMissingTracks`
   * returns early before ever statting the root when it has nothing to
   * check — so this needs a track under the root first, same as the real
   * scenario: a folder that had music in it, then stopped existing.
   */
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

    const result = await syncLibrary(rootPath, root.id, { scan: true });

    assert.ok(result, 'a fresh call must not be turned away as already-running');
    assert.equal(result!.scan, undefined, 'no scan summary is attempted when the root cannot be read');
    assert.ok(result!.reconcile.aborted, 'the vanished root must be reported, not silently swallowed');

    await temp.cleanup();
  });
});
