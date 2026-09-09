import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import { upsertTrack } from '../db/library.js';
import { insertUser } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { signMediaToken } from '../services/token.js';
import { buildETag } from '../services/streaming.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';

/**
 * The audio path, end to end over the real Fastify instance.
 *
 * The bytes are not real audio and do not need to be: nothing on this path
 * decodes them. It reads a file, answers conditional requests about it, and
 * slices byte ranges out of it — all of which is exactly as true of 4 KB of
 * filler as of a FLAC.
 */

// Distinct per byte so a wrong slice is a failed assertion, not a coincidence.
const BODY = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251));

let app: FastifyInstance;
let cleanup: () => Promise<void>;
let trackPath: string;
let trackId: number;
let mediaToken: string;
let etag: string;
let mtimeMs: number;

before(async () => {
  app = buildApp();
  await app.ready();

  const temp = await makeTempDir('stream');
  cleanup = temp.cleanup;
  trackPath = join(temp.path, 'track.mp3');
  await writeFile(trackPath, BODY);
});

after(async () => {
  await app.close();
  // Only what this suite created — see the testing rules in .docs/CLAUDE.md.
  await cleanup();
});

beforeEach(async () => {
  resetDatabase();

  const user = insertUser('listener', await hashPassword('correct horse battery staple'));
  mediaToken = signMediaToken({ id: user.id, username: user.username });

  const track = upsertTrack({
    path: trackPath,
    title: 'Filler',
    artistName: 'Nobody',
    albumTitle: null,
    albumYear: null,
    trackNumber: null,
    duration: 1,
    format: 'MP3',
    fileSize: BODY.length,
  });
  trackId = track.id;

  const { stat } = await import('node:fs/promises');
  const stats = await stat(trackPath);
  mtimeMs = stats.mtimeMs;
  etag = buildETag(stats.size, stats.mtimeMs);
});

function streamUrl(query = ''): string {
  return `/api/tracks/${trackId}/stream?token=${mediaToken}${query}`;
}

describe('streaming a whole track', () => {
  it('serves the file with the validators a cache needs', async () => {
    const res = await app.inject({ method: 'GET', url: streamUrl() });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'audio/mpeg');
    assert.equal(res.headers['accept-ranges'], 'bytes');
    assert.equal(res.headers['content-length'], String(BODY.length));
    assert.equal(res.headers.etag, etag);
    assert.equal(res.headers['cache-control'], 'private, max-age=86400');
    assert.ok(res.headers['last-modified'], 'a Last-Modified is required for If-Modified-Since');
    assert.deepEqual(res.rawPayload, BODY);
  });
});

describe('conditional requests', () => {
  it('answers 304 with no body when the client already holds the file', async () => {
    // This is the whole point: replaying a track should cost a header
    // exchange, not another full download.
    const res = await app.inject({
      method: 'GET',
      url: streamUrl(),
      headers: { 'if-none-match': etag },
    });

    assert.equal(res.statusCode, 304);
    assert.equal(res.rawPayload.length, 0);
    assert.equal(res.headers.etag, etag);
  });

  it('answers 304 for an If-Modified-Since past the mtime', async () => {
    const res = await app.inject({
      method: 'GET',
      url: streamUrl(),
      headers: { 'if-modified-since': new Date(mtimeMs + 60_000).toUTCString() },
    });

    assert.equal(res.statusCode, 304);
  });

  it('resends the file when the client holds a different version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: streamUrl(),
      headers: { 'if-none-match': '"deadbeef-1"' },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.rawPayload, BODY);
  });
});

describe('byte ranges', () => {
  it('serves a range as 206 with the right slice', async () => {
    const res = await app.inject({
      method: 'GET',
      url: streamUrl(),
      headers: { range: 'bytes=100-199' },
    });

    assert.equal(res.statusCode, 206);
    assert.equal(res.headers['content-range'], `bytes 100-199/${BODY.length}`);
    assert.equal(res.headers['content-length'], '100');
    assert.deepEqual(res.rawPayload, BODY.subarray(100, 200));
  });

  it('honours a range whose If-Range still matches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: streamUrl(),
      headers: { range: 'bytes=100-199', 'if-range': etag },
    });

    assert.equal(res.statusCode, 206);
    assert.deepEqual(res.rawPayload, BODY.subarray(100, 200));
  });

  it('resends the whole file when If-Range no longer matches', async () => {
    // A player reconnecting into a file that changed underneath must not get
    // new bytes spliced onto the old ones — that is a corrupt stream, and it
    // would arrive looking like a successful 206.
    const res = await app.inject({
      method: 'GET',
      url: streamUrl(),
      headers: { range: 'bytes=100-199', 'if-range': '"deadbeef-1"' },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-length'], String(BODY.length));
    assert.deepEqual(res.rawPayload, BODY);
  });

  it('rejects an unsatisfiable range with the file size', async () => {
    const res = await app.inject({
      method: 'GET',
      url: streamUrl(),
      headers: { range: 'bytes=99999-' },
    });

    assert.equal(res.statusCode, 416);
    assert.equal(res.headers['content-range'], `bytes */${BODY.length}`);
  });
});

describe('the data-saver path', () => {
  it('refuses rather than sending the full-size original when every slot is busy', async () => {
    // Saturation is a guard, not a routine path, so it is forced here rather
    // than by racing real transcodes. Serving the original instead would blow
    // the data budget of the one caller who explicitly asked not to.
    const original = config.maxConcurrentTranscodes;
    config.maxConcurrentTranscodes = 0;
    try {
      const res = await app.inject({ method: 'GET', url: streamUrl('&quality=low') });

      assert.equal(res.statusCode, 503);
      assert.equal(res.headers['retry-after'], '5');
      assert.notDeepEqual(res.rawPayload, BODY, 'must not fall back to the untranscoded file');
    } finally {
      config.maxConcurrentTranscodes = original;
    }
  });
});
