import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { countMissingTracks, listMissingTracks, upsertTrack } from '../db/library.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';
import { reconcileMissingTracks } from './scanner.js';

/**
 * The sweep that keeps the database honest about what is on disk.
 *
 * Nothing here needs real audio — reconciliation only ever asks the
 * filesystem whether a path exists, so empty files are the whole fixture.
 */

let library = '';
let cleanup: () => Promise<void> = async () => {};

before(async () => {
  const temp = await makeTempDir('reconcile');
  library = join(temp.path, 'library');
  // Only what this suite created — see the testing rules in .docs/CLAUDE.md.
  cleanup = temp.cleanup;
  await mkdir(library, { recursive: true });
});

after(async () => {
  await cleanup();
});

beforeEach(async () => {
  resetDatabase();
  await rm(library, { recursive: true, force: true });
  await mkdir(library, { recursive: true });
});

/** Inserts a track row, creating its file unless `onDisk` is false. */
async function addTrack(name: string, { onDisk = true, root = library } = {}): Promise<number> {
  const path = join(root, name);
  if (onDisk) await writeFile(path, 'not really audio');

  return upsertTrack({
    path,
    title: name,
    artistName: 'Nobody',
    albumTitle: null,
    albumYear: null,
    trackNumber: null,
    duration: 1,
    format: 'MP3',
    fileSize: 16,
  }).id;
}

describe('reconcileMissingTracks', () => {
  it('does nothing on an empty library', async () => {
    const result = await reconcileMissingTracks(library);
    assert.equal(result.checked, 0);
    assert.equal(result.newlyMissing, 0);
  });

  it('leaves present files alone', async () => {
    await addTrack('a.mp3');
    await addTrack('b.mp3');

    const result = await reconcileMissingTracks(library);

    assert.equal(result.checked, 2);
    assert.equal(result.newlyMissing, 0);
    assert.equal(countMissingTracks(), 0);
  });

  it('flags a file that has gone', async () => {
    const id = await addTrack('a.mp3');
    await addTrack('b.mp3');
    await rm(join(library, 'a.mp3'));

    const result = await reconcileMissingTracks(library);

    assert.equal(result.newlyMissing, 1);
    assert.equal(result.missingTotal, 1);
    const missing = listMissingTracks();
    assert.equal(missing.length, 1);
    assert.equal(missing[0].id, id);
    assert.ok(missing[0].missingSince, 'a flagged track records when it went missing');
  });

  it('marks rather than deletes', async () => {
    // Deleting would take favorites and playlist entries with it, for a file
    // that may still exist in a backup or on another disk.
    await addTrack('a.mp3');
    await rm(join(library, 'a.mp3'));

    await reconcileMissingTracks(library);

    assert.equal(countMissingTracks(), 1, 'the row is still there, flagged');
  });

  it('keeps the original date when a file is still missing on a later sweep', async () => {
    // `missing_since` answers "since when". Re-stamping it every sweep would
    // make a months-old absence look like it happened this morning.
    await addTrack('a.mp3');
    await rm(join(library, 'a.mp3'));

    await reconcileMissingTracks(library, { now: new Date('2026-01-01T00:00:00Z') });
    const second = await reconcileMissingTracks(library, { now: new Date('2026-06-01T00:00:00Z') });

    assert.equal(second.newlyMissing, 0, 'already-known absences are not "newly" missing');
    assert.equal(second.missingTotal, 1);
    assert.equal(listMissingTracks()[0].missingSince, '2026-01-01T00:00:00.000Z');
  });

  it('clears the flag when a file comes back', async () => {
    // A library on a mount that comes and goes has to heal, not accumulate.
    await addTrack('a.mp3');
    await rm(join(library, 'a.mp3'));
    await reconcileMissingTracks(library);
    assert.equal(countMissingTracks(), 1);

    await writeFile(join(library, 'a.mp3'), 'back again');
    const result = await reconcileMissingTracks(library);

    assert.equal(result.recovered, 1);
    assert.equal(countMissingTracks(), 0);
  });

  it('counts missing tracks that sit outside the library root', async () => {
    // The real case: rows left over from a library that used to live
    // somewhere else. No scan of the current root can ever heal these.
    await addTrack('a.mp3');
    await addTrack('stranded.mp3', { onDisk: false, root: '/nonexistent-elsewhere' });

    const result = await reconcileMissingTracks(library);

    assert.equal(result.newlyMissing, 1);
    assert.equal(result.strandedOutsideRoot, 1);
  });
});

describe('the reconciliation guard', () => {
  it('refuses to mark anything when the library root is unreadable', async () => {
    // A mount that has not come up looks exactly like a library that was
    // deleted. This project has already destroyed its music once by acting on
    // that ambiguity, so the ambiguous case does nothing and says so.
    await addTrack('a.mp3');
    await addTrack('b.mp3');

    const result = await reconcileMissingTracks(join(library, 'not-mounted-yet'));

    assert.ok(result.aborted, 'the sweep must report why it stopped');
    assert.match(result.aborted!, /library root is unreadable/);
    assert.equal(countMissingTracks(), 0, 'nothing may be marked when the root is gone');
  });

  it('refuses when more than the allowed share vanishes at once', async () => {
    for (const name of ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']) await addTrack(name);
    await rm(join(library, 'a.mp3'));
    await rm(join(library, 'b.mp3'));
    await rm(join(library, 'c.mp3'));

    const result = await reconcileMissingTracks(library, { abortRatio: 0.5 });

    assert.ok(result.aborted, 'losing three of four at once is a storage failure');
    assert.match(result.aborted!, /over the 50% limit/);
    assert.equal(countMissingTracks(), 0);
  });

  it('still marks an ordinary handful of deletions', async () => {
    // The guard must not be so eager that it stops doing the job.
    for (const name of ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']) await addTrack(name);
    await rm(join(library, 'a.mp3'));

    const result = await reconcileMissingTracks(library, { abortRatio: 0.5 });

    assert.equal(result.aborted, undefined);
    assert.equal(countMissingTracks(), 1);
  });

  it('applies the ratio only once enough tracks are involved', async () => {
    // A plain ratio protects tiny libraries into uselessness — one deleted
    // file out of two is 50%. Below the floor the ratio is not consulted, and
    // the cost of being wrong is small: the flag is reversible and the next
    // sweep clears it. The root-unreadable check above is what actually
    // catches a vanished mount, whatever the library's size.
    await addTrack('a.mp3');
    await addTrack('b.mp3');
    await rm(join(library, 'a.mp3'));
    await rm(join(library, 'b.mp3'));

    const result = await reconcileMissingTracks(library, { abortRatio: 0.5 });

    assert.equal(result.aborted, undefined);
    assert.equal(countMissingTracks(), 2);
  });

  it('does not count an already-flagged track toward the guard', async () => {
    // Otherwise a library that legitimately lost half its files once would be
    // permanently unable to record the next single deletion.
    for (const name of ['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']) await addTrack(name);
    await rm(join(library, 'a.mp3'));
    await rm(join(library, 'b.mp3'));
    await reconcileMissingTracks(library, { abortRatio: 0.5 });
    assert.equal(countMissingTracks(), 2);

    await rm(join(library, 'c.mp3'));
    const result = await reconcileMissingTracks(library, { abortRatio: 0.5 });

    assert.equal(result.aborted, undefined, 'only newly-missing files count toward the limit');
    assert.equal(countMissingTracks(), 3);
  });
});
