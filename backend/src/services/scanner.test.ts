import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, beforeEach, describe, it } from 'node:test';
import { db } from '../db/connection.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';
import { scanLibrary } from './scanner.js';

const run = promisify(execFile);

/** Generates a real audio file — the scanner's whole job is reading actual tags. */
async function makeAudio(
  path: string,
  tags: { title?: string; artist?: string; album?: string } = {},
): Promise<void> {
  const args = ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1'];
  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined) args.push('-metadata', `${key}=${value}`);
  }
  args.push(path);
  await run('ffmpeg', args);
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

const count = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

// Foreign keys are enforced, so every scanned track needs a real
// `library_roots` row — set fresh in `beforeEach` below.
let TEST_ROOT_ID = 0;

describe('scanLibrary', async () => {
  let library = '';
  let cleanup: () => Promise<void> = async () => {};

  // The scanner reads real files with real tags; without ffmpeg there is
  // nothing meaningful to read, so skip rather than assert against fixtures
  // that don't exist.
  const ffmpegAvailable = await hasFfmpeg();

  before(async () => {
    const dir = await makeTempDir('scan');
    library = dir.path;
    cleanup = dir.cleanup;

    if (!ffmpegAvailable) return;

    await makeAudio(join(library, 'tagged.mp3'), {
      title: 'Tagged Song',
      artist: 'Test Artist',
      album: 'Test Album',
    });
    await makeAudio(join(library, 'untagged.mp3'));

    // Nested, to prove the walk recurses.
    await mkdir(join(library, 'Some Artist', 'Some Album'), { recursive: true });
    await makeAudio(join(library, 'Some Artist', 'Some Album', 'nested.mp3'), {
      title: 'Nested Song',
      artist: 'Nested Artist',
      album: 'Nested Album',
    });

    // Non-audio files that must be ignored entirely.
    await writeFile(join(library, 'cover.jpg'), 'not audio');
    await writeFile(join(library, 'notes.txt'), 'not audio');
    await writeFile(join(library, 'playlist.m3u'), 'not audio');

    // A file with an audio extension that is not audio — must be reported as a
    // failure without aborting the rest of the scan.
    await writeFile(join(library, 'corrupt.flac'), 'definitely not a FLAC');
  });

  after(async () => {
    await cleanup();
  });

  beforeEach(() => {
    resetDatabase();
    TEST_ROOT_ID = insertLibraryRoot(library, null).id;
  });

  it('finds only supported audio extensions', { skip: !ffmpegAvailable }, async () => {
    const summary = await scanLibrary(library, TEST_ROOT_ID);
    // 3 valid + 1 corrupt .flac; the .jpg/.txt/.m3u are never opened.
    assert.equal(summary.filesFound, 4, JSON.stringify(summary));
  });

  it('recurses into subdirectories', { skip: !ffmpegAvailable }, async () => {
    await scanLibrary(library, TEST_ROOT_ID);
    const nested = db
      .prepare('SELECT title FROM tracks WHERE path LIKE ?')
      .get('%Some Album%') as { title: string } | undefined;
    assert.equal(nested?.title, 'Nested Song');
  });

  it('reads tags into artists and albums', { skip: !ffmpegAvailable }, async () => {
    await scanLibrary(library, TEST_ROOT_ID);
    const row = db
      .prepare(
        `SELECT t.title, a.name AS artist, al.title AS album
         FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id
         LEFT JOIN albums al ON al.id = t.album_id
         WHERE t.title = 'Tagged Song'`,
      )
      .get() as { title: string; artist: string; album: string } | undefined;

    assert.deepEqual(row, { title: 'Tagged Song', artist: 'Test Artist', album: 'Test Album' });
  });

  it('falls back to the filename and Unknown Artist for an untagged file', { skip: !ffmpegAvailable }, async () => {
    await scanLibrary(library, TEST_ROOT_ID);
    const row = db
      .prepare(
        `SELECT t.title, a.name AS artist, t.album_id
         FROM tracks t LEFT JOIN artists a ON a.id = t.artist_id
         WHERE t.path LIKE '%untagged.mp3'`,
      )
      .get() as { title: string; artist: string; album_id: number | null } | undefined;

    assert.equal(row?.title, 'untagged', 'title should come from the filename, without the extension');
    assert.equal(row?.artist, 'Unknown Artist');
    assert.equal(row?.album_id, null, 'an untagged file should not invent an album');
  });

  it('reports an unreadable file without aborting the scan', { skip: !ffmpegAvailable }, async () => {
    const summary = await scanLibrary(library, TEST_ROOT_ID);

    assert.equal(summary.filesFailed, 1, JSON.stringify(summary.failures));
    assert.match(summary.failures[0].path, /corrupt\.flac$/);
    assert.ok(summary.failures[0].error.length > 0, 'a failure should carry a reason');

    // The point of the test: the other three still landed.
    assert.equal(summary.filesAdded, 3);
    assert.equal(count('tracks'), 3);
  });

  it('is idempotent — a re-scan updates rather than duplicates', { skip: !ffmpegAvailable }, async () => {
    const first = await scanLibrary(library, TEST_ROOT_ID);
    assert.equal(first.filesAdded, 3);
    assert.equal(first.filesUpdated, 0);

    const artistsAfterFirst = count('artists');
    const albumsAfterFirst = count('albums');

    const second = await scanLibrary(library, TEST_ROOT_ID);
    assert.equal(second.filesAdded, 0, 'nothing new on a re-scan');
    assert.equal(second.filesUpdated, 3);

    assert.equal(count('tracks'), 3, 'a re-scan must not duplicate tracks');
    assert.equal(count('artists'), artistsAfterFirst, 'a re-scan must not duplicate artists');
    assert.equal(count('albums'), albumsAfterFirst, 'a re-scan must not duplicate albums');
  });

  it('returns a summary whose counts add up', { skip: !ffmpegAvailable }, async () => {
    const s = await scanLibrary(library, TEST_ROOT_ID);
    assert.equal(s.filesFound, s.filesAdded + s.filesUpdated + s.filesFailed);
    assert.ok(s.durationMs >= 0);
  });

  it('handles an empty directory without failing', async () => {
    const empty = await makeTempDir('scan-empty');
    try {
      const summary = await scanLibrary(empty.path, TEST_ROOT_ID);
      assert.deepEqual(
        { found: summary.filesFound, added: summary.filesAdded, failed: summary.filesFailed },
        { found: 0, added: 0, failed: 0 },
      );
    } finally {
      await empty.cleanup();
    }
  });

  it(
    'skips a subdirectory it cannot read instead of aborting the whole scan',
    { skip: !ffmpegAvailable },
    async () => {
      // A Windows drive's own `System Volume Information`/`$RECYCLE.BIN`
      // are exactly this: real, unreadable-by-this-user subdirectories
      // sitting alongside real music once a whole drive is mounted in.
      const temp = await makeTempDir('scan-locked');
      const root = insertLibraryRoot(temp.path, null).id;
      try {
        await makeAudio(join(temp.path, 'track.mp3'), { title: 'Reachable' });
        const locked = join(temp.path, 'Locked');
        await mkdir(locked);
        await chmod(locked, 0o000);

        const summary = await scanLibrary(temp.path, root);
        assert.equal(summary.filesFound, 1, 'the reachable file must still be found');
        assert.equal(summary.unreadableDirs, 1, JSON.stringify(summary));

        await chmod(locked, 0o755); // restorable before cleanup can remove it
      } finally {
        await temp.cleanup();
      }
    },
  );
});
