import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { makeTempDir } from '../testing/tempDir.js';
import { isValidArtworkId, mimeTypeForArtwork, thumbnailPathFor } from './artwork.js';

const run = promisify(execFile);
const ffmpegAvailable = await run('ffmpeg', ['-version']).then(
  () => true,
  () => false,
);

const HASH = 'a'.repeat(64);

describe('artwork id validation', () => {
  it('accepts a well-formed id', () => {
    for (const ext of ['jpg', 'png', 'webp', 'gif']) {
      assert.ok(isValidArtworkId(`${HASH}.${ext}`), ext);
    }
  });

  it('rejects path traversal', () => {
    // Artwork ids become file paths; this keeps a bad row from reading /etc/passwd.
    assert.equal(isValidArtworkId('../../../etc/passwd'), false);
    assert.equal(isValidArtworkId(`../${HASH}.jpg`), false);
    assert.equal(isValidArtworkId(`${HASH}/../../x.jpg`), false);
    assert.equal(isValidArtworkId(`/etc/${HASH}.jpg`), false);
  });

  it('rejects malformed ids', () => {
    assert.equal(isValidArtworkId(''), false);
    assert.equal(isValidArtworkId(HASH), false, 'no extension');
    assert.equal(isValidArtworkId(`${HASH}.exe`), false, 'unsupported extension');
    assert.equal(isValidArtworkId(`${'a'.repeat(63)}.jpg`), false, 'hash too short');
    assert.equal(isValidArtworkId(`${'A'.repeat(64)}.jpg`), false, 'uppercase hex');
    assert.equal(isValidArtworkId(`${HASH}.jpg.thumb.jpg`), false);
  });
});

describe('artwork mime types', () => {
  it('maps each supported extension', () => {
    assert.equal(mimeTypeForArtwork(`${HASH}.jpg`), 'image/jpeg');
    assert.equal(mimeTypeForArtwork(`${HASH}.png`), 'image/png');
    assert.equal(mimeTypeForArtwork(`${HASH}.webp`), 'image/webp');
    assert.equal(mimeTypeForArtwork(`${HASH}.gif`), 'image/gif');
  });

  it('falls back for anything unknown', () => {
    assert.equal(mimeTypeForArtwork(`${HASH}.bin`), 'application/octet-stream');
  });
});

describe('cover thumbnails', { skip: !ffmpegAvailable && 'ffmpeg not installed' }, () => {
  let root: string;
  let cleanup: () => Promise<void>;
  const ids: string[] = [];

  before(async () => {
    ({ path: root, cleanup } = await makeTempDir('artwork-thumbs'));
    for (let i = 0; i < 5; i++) {
      const id = `${String(i).repeat(64)}.png`;
      await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=red:s=${600 + i}x600`, '-frames:v', '1', join(root, id)]);
      ids.push(id);
    }
  });

  after(() => cleanup());

  it('makes one thumbnail when the same cover is asked for at once', async () => {
    const paths = await Promise.all(Array.from({ length: 10 }, () => thumbnailPathFor(root, ids[0])));
    const thumb = join(root, `${ids[0]}.thumb.jpg`);
    assert.ok(paths.every((p) => p === thumb));
    assert.deepEqual((await readdir(root)).filter((f) => f.includes('.tmp.')), []);
  });

  it('queues different covers past the slot limit and still makes each one', async () => {
    const paths = await Promise.all(ids.map((id) => thumbnailPathFor(root, id)));
    assert.deepEqual(paths, ids.map((id) => join(root, `${id}.thumb.jpg`)));
  });
});
