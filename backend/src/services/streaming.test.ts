import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mimeTypeFor, parseRange } from './streaming.js';

const SIZE = 1000; // valid byte offsets are 0..999

describe('parseRange', () => {
  it('reports no range when the header is absent', () => {
    assert.equal(parseRange(undefined, SIZE), 'none');
  });

  it('parses a closed range inclusively', () => {
    // HTTP ranges include the end byte: 0-99 is 100 bytes, not 99.
    assert.deepEqual(parseRange('bytes=0-99', SIZE), { start: 0, end: 99 });
    assert.deepEqual(parseRange('bytes=500-599', SIZE), { start: 500, end: 599 });
  });

  it('parses an open-ended range to the last byte', () => {
    assert.deepEqual(parseRange('bytes=100-', SIZE), { start: 100, end: SIZE - 1 });
    assert.deepEqual(parseRange('bytes=0-', SIZE), { start: 0, end: SIZE - 1 });
  });

  it('parses a suffix range as the last N bytes', () => {
    assert.deepEqual(parseRange('bytes=-100', SIZE), { start: 900, end: 999 });
    assert.deepEqual(parseRange('bytes=-1', SIZE), { start: 999, end: 999 });
  });

  it('clamps a suffix longer than the file to the whole file', () => {
    assert.deepEqual(parseRange('bytes=-5000', SIZE), { start: 0, end: 999 });
  });

  it('clamps an end past the last byte rather than rejecting it', () => {
    // Players routinely ask for more than exists at the tail of a file.
    assert.deepEqual(parseRange('bytes=900-99999', SIZE), { start: 900, end: 999 });
  });

  it('accepts the single last byte', () => {
    assert.deepEqual(parseRange(`bytes=${SIZE - 1}-${SIZE - 1}`, SIZE), { start: 999, end: 999 });
  });

  it('rejects a start at or past the end of the file', () => {
    assert.equal(parseRange(`bytes=${SIZE}-`, SIZE), 'invalid');
    assert.equal(parseRange(`bytes=${SIZE}-${SIZE + 10}`, SIZE), 'invalid');
    assert.equal(parseRange('bytes=99999-', SIZE), 'invalid');
  });

  it('rejects an inverted range', () => {
    assert.equal(parseRange('bytes=500-100', SIZE), 'invalid');
  });

  it('rejects a zero-length suffix', () => {
    assert.equal(parseRange('bytes=-0', SIZE), 'invalid');
  });

  it('rejects malformed headers', () => {
    for (const header of [
      'bytes=',
      'bytes=-',
      'bytes=abc-def',
      'bytes=1.5-2',
      'items=0-99',
      '0-99',
      'bytes 0-99',
      'bytes=-100-200',
    ]) {
      assert.equal(parseRange(header, SIZE), 'invalid', `expected "${header}" to be invalid`);
    }
  });

  it('rejects multi-range requests rather than serving only the first part', () => {
    // Multipart ranges are unsupported; answering with just the first range
    // would be a wrong response, not a partial one.
    assert.equal(parseRange('bytes=0-99,200-299', SIZE), 'invalid');
  });

  it('tolerates surrounding whitespace', () => {
    assert.deepEqual(parseRange('  bytes=0-99  ', SIZE), { start: 0, end: 99 });
  });

  it('handles a one-byte file', () => {
    assert.deepEqual(parseRange('bytes=0-', 1), { start: 0, end: 0 });
    assert.equal(parseRange('bytes=1-', 1), 'invalid');
  });
});

describe('mimeTypeFor', () => {
  it('maps every format the scanner accepts', () => {
    assert.equal(mimeTypeFor('/music/a.flac'), 'audio/flac');
    assert.equal(mimeTypeFor('/music/a.opus'), 'audio/opus');
    assert.equal(mimeTypeFor('/music/a.mp3'), 'audio/mpeg');
    assert.equal(mimeTypeFor('/music/a.m4a'), 'audio/mp4');
    assert.equal(mimeTypeFor('/music/a.ogg'), 'audio/ogg');
  });

  it('is case-insensitive about the extension', () => {
    assert.equal(mimeTypeFor('/music/A.FLAC'), 'audio/flac');
    assert.equal(mimeTypeFor('/music/A.Mp3'), 'audio/mpeg');
  });

  it('falls back to a generic type rather than guessing', () => {
    assert.equal(mimeTypeFor('/music/a.wav'), 'application/octet-stream');
    assert.equal(mimeTypeFor('/music/noextension'), 'application/octet-stream');
  });

  it('is not fooled by a dot inside the filename', () => {
    assert.equal(mimeTypeFor('/music/Album 1.5 - Track.mp3'), 'audio/mpeg');
  });
});
