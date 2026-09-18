import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUDIO_EXTENSIONS } from './trackTags.js';
import {
  buildETag,
  ifRangeAllowsRange,
  isNotModified,
  isWebKitOnlyClient,
  mimeTypeFor,
  parseRange,
} from './streaming.js';

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
    assert.equal(mimeTypeFor('/music/a.wav'), 'audio/wav');
    assert.equal(mimeTypeFor('/music/a.aac'), 'audio/aac');
  });

  it('covers exactly what the library accepts, with nothing missing', () => {
    // The two sets drift apart silently otherwise: a format the scanner will
    // ingest but the stream route cannot type gets served as a download.
    for (const ext of AUDIO_EXTENSIONS) {
      assert.notEqual(
        mimeTypeFor(`/music/a${ext}`),
        'application/octet-stream',
        `${ext} is accepted by the scanner but has no MIME type`,
      );
    }
  });

  it('is case-insensitive about the extension', () => {
    assert.equal(mimeTypeFor('/music/A.FLAC'), 'audio/flac');
    assert.equal(mimeTypeFor('/music/A.Mp3'), 'audio/mpeg');
  });

  it('falls back to a generic type rather than guessing', () => {
    assert.equal(mimeTypeFor('/music/a.aiff'), 'application/octet-stream');
    assert.equal(mimeTypeFor('/music/noextension'), 'application/octet-stream');
  });

  it('is not fooled by a dot inside the filename', () => {
    assert.equal(mimeTypeFor('/music/Album 1.5 - Track.mp3'), 'audio/mpeg');
  });
});

describe('isWebKitOnlyClient', () => {
  it('is false with no User-Agent at all', () => {
    assert.equal(isWebKitOnlyClient(undefined), false);
  });

  it('catches every browser on iOS, whatever engine its UA claims', () => {
    // Safari.
    assert.equal(
      isWebKitOnlyClient(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ),
      true,
    );
    // Chrome for iOS — still WebKit under the hood; Apple requires it.
    assert.equal(
      isWebKitOnlyClient(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
      ),
      true,
    );
    // An iPad reports itself the same way.
    assert.equal(
      isWebKitOnlyClient(
        'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ),
      true,
    );
  });

  it('catches desktop Safari', () => {
    assert.equal(
      isWebKitOnlyClient(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      ),
      true,
    );
  });

  it('is not fooled by Chrome, Chromium or Edge on desktop, which also carry "Safari" in their UA', () => {
    assert.equal(
      isWebKitOnlyClient(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
      false,
    );
    assert.equal(
      isWebKitOnlyClient(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      ),
      false,
    );
  });

  it('is false for a non-WebKit browser with no "Safari" token at all', () => {
    assert.equal(
      isWebKitOnlyClient('Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0'),
      false,
    );
  });
});

describe('buildETag', () => {
  const ETAG = buildETag(1000, 1_700_000_000_000);

  it('is a strong tag', () => {
    // Weak tags are not allowed to validate an If-Range, so a weak one here
    // would silently disable resumable seeking.
    assert.match(ETAG, /^"[^"]+"$/);
    assert.ok(!ETAG.startsWith('W/'));
  });

  it('is stable for the same file', () => {
    assert.equal(buildETag(1000, 1_700_000_000_000), ETAG);
  });

  it('changes when either the size or the mtime changes', () => {
    assert.notEqual(buildETag(1001, 1_700_000_000_000), ETAG);
    assert.notEqual(buildETag(1000, 1_700_000_001_000), ETAG);
  });
});

describe('isNotModified', () => {
  const MTIME = Date.parse('2026-01-15T10:30:00Z');
  const ETAG = buildETag(SIZE, MTIME);

  it('is false when the client sent no validator', () => {
    assert.equal(isNotModified({}, ETAG, MTIME), false);
  });

  it('matches an exact If-None-Match', () => {
    assert.equal(isNotModified({ ifNoneMatch: ETAG }, ETAG, MTIME), true);
  });

  it('matches a wildcard If-None-Match', () => {
    assert.equal(isNotModified({ ifNoneMatch: '*' }, ETAG, MTIME), true);
  });

  it('finds the tag anywhere in a list', () => {
    assert.equal(isNotModified({ ifNoneMatch: `"other", ${ETAG}, "third"` }, ETAG, MTIME), true);
  });

  it('matches weakly, as If-None-Match requires', () => {
    // The client may downgrade a tag to weak; that still means "I have this".
    assert.equal(isNotModified({ ifNoneMatch: `W/${ETAG}` }, ETAG, MTIME), true);
  });

  it('rejects a tag for a different representation', () => {
    assert.equal(isNotModified({ ifNoneMatch: '"deadbeef-1"' }, ETAG, MTIME), false);
  });

  it('honours If-Modified-Since when no tag was sent', () => {
    assert.equal(
      isNotModified({ ifModifiedSince: new Date(MTIME + 60_000).toUTCString() }, ETAG, MTIME),
      true,
    );
    assert.equal(
      isNotModified({ ifModifiedSince: new Date(MTIME - 60_000).toUTCString() }, ETAG, MTIME),
      false,
    );
  });

  it('treats an exactly-equal If-Modified-Since as unmodified', () => {
    assert.equal(isNotModified({ ifModifiedSince: new Date(MTIME).toUTCString() }, ETAG, MTIME), true);
  });

  it('compares If-Modified-Since at whole seconds', () => {
    // HTTP dates carry no sub-second part, so a file written 400ms after the
    // date the client holds must not read as newer than it.
    const mtime = MTIME + 400;
    assert.equal(
      isNotModified({ ifModifiedSince: new Date(MTIME).toUTCString() }, buildETag(SIZE, mtime), mtime),
      true,
    );
  });

  it('ignores an unparseable If-Modified-Since rather than assuming a hit', () => {
    assert.equal(isNotModified({ ifModifiedSince: 'not a date' }, ETAG, MTIME), false);
  });

  it('lets If-None-Match decide even when If-Modified-Since disagrees', () => {
    // RFC 9110: If-Modified-Since is only consulted when there is no tag.
    assert.equal(
      isNotModified(
        { ifNoneMatch: '"stale"', ifModifiedSince: new Date(MTIME + 60_000).toUTCString() },
        ETAG,
        MTIME,
      ),
      false,
    );
  });
});

describe('ifRangeAllowsRange', () => {
  const MTIME = Date.parse('2026-01-15T10:30:00Z');
  const ETAG = buildETag(SIZE, MTIME);

  it('allows the range when the client made no claim', () => {
    assert.equal(ifRangeAllowsRange(undefined, ETAG, MTIME), true);
  });

  it('allows the range for a matching tag', () => {
    assert.equal(ifRangeAllowsRange(ETAG, ETAG, MTIME), true);
  });

  it('refuses the range when the file changed underneath', () => {
    // Splicing bytes from a new file onto bytes from an old one hands the
    // decoder a corrupt stream; the whole file has to be resent instead.
    assert.equal(ifRangeAllowsRange('"deadbeef-1"', ETAG, MTIME), false);
  });

  it('refuses a weak tag, which If-Range may not accept', () => {
    assert.equal(ifRangeAllowsRange(`W/${ETAG}`, ETAG, MTIME), false);
  });

  it('allows the range for an exactly-matching date', () => {
    assert.equal(ifRangeAllowsRange(new Date(MTIME).toUTCString(), ETAG, MTIME), true);
  });

  it('refuses a date that is not the file mtime', () => {
    assert.equal(ifRangeAllowsRange(new Date(MTIME - 60_000).toUTCString(), ETAG, MTIME), false);
    assert.equal(ifRangeAllowsRange(new Date(MTIME + 60_000).toUTCString(), ETAG, MTIME), false);
  });

  it('refuses an unparseable value', () => {
    assert.equal(ifRangeAllowsRange('garbage', ETAG, MTIME), false);
  });
});
