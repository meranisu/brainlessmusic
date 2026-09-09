import assert from 'node:assert/strict';
import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { makeTempDir } from '../testing/harness.js';
import { fileIntoLibrary, sanitizePathSegment } from './trackFiling.js';
import type { TrackTags } from './trackTags.js';

function tags(overrides: Partial<TrackTags> = {}): TrackTags {
  return {
    title: 'A Song',
    artistName: 'An Artist',
    albumTitle: 'An Album',
    albumYear: null,
    trackNumber: null,
    duration: null,
    format: null,
    bitrate: null,
    sampleRate: null,
    picture: null,
    ...overrides,
  };
}

/**
 * These tests own every directory they touch.
 *
 * An earlier version of this file deleted `config.libraryPath` in `beforeEach`,
 * which is safe only while the isolated test environment is in force. Run
 * directly with `tsx --test` instead of through `npm test`, it resolved to the
 * real LIBRARY_PATH and removed it. A test must never delete a directory it did
 * not create — so `library` and `staging` below are freshly made per file, live
 * outside the repository, and are the only things ever removed.
 */
let library = '';
let staging = '';
let cleanups: Array<() => Promise<void>> = [];

async function stage(name: string, contents = 'audio bytes'): Promise<string> {
  const path = join(staging, name);
  await writeFile(path, contents);
  return path;
}

describe('sanitizePathSegment', () => {
  it('replaces characters that are invalid in a path', () => {
    assert.equal(sanitizePathSegment('AC/DC', 'x'), 'AC_DC');
    assert.equal(sanitizePathSegment('a:b*c?d"e<f>g|h', 'x'), 'a_b_c_d_e_f_g_h');
  });

  it('strips control characters', () => {
    assert.equal(sanitizePathSegment('BadName', 'x'), 'Bad_Name_');
  });

  it('collapses runs of whitespace', () => {
    assert.equal(sanitizePathSegment('Too    many   spaces', 'x'), 'Too many spaces');
  });

  it('trims trailing dots, which Windows rejects', () => {
    assert.equal(sanitizePathSegment('Album...', 'x'), 'Album');
    assert.equal(sanitizePathSegment('...', 'fallback'), 'fallback');
  });

  it('falls back when nothing usable survives', () => {
    assert.equal(sanitizePathSegment('', 'Unknown Artist'), 'Unknown Artist');
    assert.equal(sanitizePathSegment('   ', 'Unknown Artist'), 'Unknown Artist');
  });

  it('leaves ordinary names alone, including non-Latin scripts', () => {
    assert.equal(sanitizePathSegment('椎名林檎', 'x'), '椎名林檎');
    assert.equal(sanitizePathSegment('Sigur Rós', 'x'), 'Sigur Rós');
  });

  it('does not treat a leading dot as a problem', () => {
    // A dotfile-looking folder is odd but not dangerous, and mangling it would
    // lose information that was in the tag.
    assert.equal(sanitizePathSegment('.hidden', 'x'), '.hidden');
  });
});

describe('fileIntoLibrary', () => {
  beforeEach(async () => {
    const lib = await makeTempDir('library');
    const stg = await makeTempDir('staging');
    library = lib.path;
    staging = stg.path;
    cleanups = [lib.cleanup, stg.cleanup];
  });

  afterEach(async () => {
    // Only ever removes the mkdtemp directories created just above.
    await Promise.all(cleanups.map((fn) => fn()));
    cleanups = [];
  });

  it('files a track under Artist/Album, keeping the original filename', async () => {
    const src = await stage('01 Opening.mp3');
    const dest = await fileIntoLibrary(library, src, '01 Opening.mp3', tags());

    assert.equal(dest, join(library, 'An Artist', 'An Album', '01 Opening.mp3'));
    assert.deepEqual(await readdir(join(library, 'An Artist', 'An Album')), ['01 Opening.mp3']);
  });

  it('removes the staged file rather than copying it', async () => {
    const src = await stage('moved.mp3');
    await fileIntoLibrary(library, src, 'moved.mp3', tags());
    assert.deepEqual(await readdir(staging), []);
  });

  it('sanitizes artist and album into folder names', async () => {
    const src = await stage('t.mp3');
    const dest = await fileIntoLibrary(library, src, 't.mp3', tags({ artistName: 'AC/DC', albumTitle: 'Back: In Black' }));
    assert.equal(dest, join(library, 'AC_DC', 'Back_ In Black', 't.mp3'));
  });

  it('uses Unknown Album when the file has no album tag', async () => {
    const src = await stage('t.mp3');
    const dest = await fileIntoLibrary(library, src, 't.mp3', tags({ albumTitle: null }));
    assert.equal(dest, join(library, 'An Artist', 'Unknown Album', 't.mp3'));
  });

  it('never overwrites an existing file', async () => {
    const first = await fileIntoLibrary(library, await stage('same.mp3'), 'same.mp3', tags());
    const second = await fileIntoLibrary(library, await stage('same.mp3'), 'same.mp3', tags());
    const third = await fileIntoLibrary(library, await stage('same.mp3'), 'same.mp3', tags());

    assert.notEqual(first, second);
    assert.equal(second, join(library, 'An Artist', 'An Album', 'same (2).mp3'));
    assert.equal(third, join(library, 'An Artist', 'An Album', 'same (3).mp3'));

    const files = (await readdir(join(library, 'An Artist', 'An Album'))).sort();
    assert.deepEqual(files, ['same (2).mp3', 'same (3).mp3', 'same.mp3']);
  });

  it('falls back to the tagged title when the original name has no usable base', async () => {
    // `....mp3` and `   .mp3` both leave nothing after sanitising the base.
    // Not `.mp3` — Node reads that as a dotfile with no extension, so it never
    // reaches here: the upload route rejects it, since `extname('.mp3')` is ''
    // and so fails the AUDIO_EXTENSIONS check.
    for (const name of ['....mp3', '   .mp3']) {
      const dest = await fileIntoLibrary(library, await stage('x.mp3'), name, tags({ title: 'Real Title' }));
      assert.equal(dest, join(library, 'An Artist', 'An Album', 'Real Title.mp3'), `for ${JSON.stringify(name)}`);
      await rm(dest);
    }
  });

  it('lower-cases the extension so the library tree stays consistent', async () => {
    const src = await stage('Loud.MP3');
    const dest = await fileIntoLibrary(library, src, 'Loud.MP3', tags());
    assert.equal(dest, join(library, 'An Artist', 'An Album', 'Loud.mp3'));
  });

  it('does not let a path separator in a tag escape the library root', async () => {
    // Tags come from file metadata, which is attacker-controlled the moment
    // you accept an upload from anyone else.
    const src = await stage('t.mp3');
    const dest = await fileIntoLibrary(library, src, 't.mp3', tags({ artistName: '../../etc', albumTitle: '..' }));

    assert.ok(dest.startsWith(library + '/'), `escaped the library root: ${dest}`);
    assert.ok(!dest.includes('/../'), `contains a traversal segment: ${dest}`);
  });

  it('does not let a path separator in the uploaded filename escape either', async () => {
    const src = await stage('t.mp3');
    const dest = await fileIntoLibrary(library, src, '../../../evil.mp3', tags());

    assert.ok(dest.startsWith(library + '/'), `escaped the library root: ${dest}`);
    assert.ok(!dest.includes('/../'), `contains a traversal segment: ${dest}`);
  });
});
