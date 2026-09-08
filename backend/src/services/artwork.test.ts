import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidArtworkId, mimeTypeForArtwork } from './artwork.js';

const HASH = 'a'.repeat(64);

describe('artwork id validation', () => {
  it('accepts a well-formed id', () => {
    for (const ext of ['jpg', 'png', 'webp', 'gif']) {
      assert.ok(isValidArtworkId(`${HASH}.${ext}`), ext);
    }
  });

  it('rejects path traversal', () => {
    // Ids come from the database, but they end up joined into a filesystem
    // path — this is the guard that keeps a bad row from reading /etc/passwd.
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
