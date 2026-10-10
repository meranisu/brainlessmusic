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

    const result = await syncLibrary(rootPath, root.id, { scan: true });

    assert.ok(result, 'a fresh call must not be turned away as already-running');
    assert.equal(result!.scan, undefined, 'no scan summary is attempted when the root cannot be read');
    assert.ok(result!.reconcile.aborted, 'the vanished root must be reported, not silently swallowed');

    await temp.cleanup();
  });
});
