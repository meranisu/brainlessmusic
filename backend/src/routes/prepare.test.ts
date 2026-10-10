import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertUser } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { signToken } from '../services/token.js';
import { getActiveTranscodes, LOW_QUALITY_VARIANT } from '../services/streaming.js';
import { cacheEntryName } from '../services/transcodeCache.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';

const run = promisify(execFile);

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

/** Resolves once no transcode holds a slot, so one case cannot leak into the next. */
async function waitForIdle(): Promise<void> {
  for (let i = 0; i < 200 && getActiveTranscodes() > 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * `POST /tracks/:id/prepare`: converts the next queued track ahead of time,
 * without ever taking the slot a real play would need.
 */
describe('preparing a track ahead of time', async () => {
  const ffmpegAvailable = await hasFfmpeg();

  let app: FastifyInstance;
  let temp: Awaited<ReturnType<typeof makeTempDir>>;
  let flacPath: string;
  let flacId: number;
  let token: string;
  const originalTranscodePath = config.transcodePath;
  const originalMaxTranscodes = config.maxConcurrentTranscodes;

  before(async () => {
    temp = await makeTempDir('prepare');
    config.transcodePath = join(temp.path, 'transcodes');
    flacPath = join(temp.path, 'track.flac');
    if (ffmpegAvailable) {
      await run('ffmpeg', [
        '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
        '-c:a', 'flac', flacPath,
      ]);
    } else {
      await writeFile(flacPath, Buffer.alloc(1024));
    }

    app = buildApp();
    await app.ready();
  });

  after(async () => {
    await waitForIdle();
    await app.close();
    config.transcodePath = originalTranscodePath;
    config.maxConcurrentTranscodes = originalMaxTranscodes;
    await temp.cleanup();
  });

  beforeEach(async () => {
    await waitForIdle();
    config.maxConcurrentTranscodes = 2;
    resetDatabase();

    const user = insertUser('listener', await hashPassword('correct horse battery staple'));
    token = signToken({ id: user.id, username: user.username });

    const rootId = insertLibraryRoot('/library', null).id;
    flacId = upsertTrack({
      path: flacPath,
      title: 'Lossless',
      artistName: 'Nobody',
      albumTitle: null,
      albumYear: null,
      trackNumber: null,
      duration: 1,
      format: 'FLAC',
      fileSize: 0,
      rootId,
    }).id;
  });

  function prepare(id: number, query = '') {
    return app.inject({
      method: 'POST',
      url: `/api/tracks/${id}/prepare${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it('needs a signed-in user', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/tracks/${flacId}/prepare?quality=low` });
    assert.equal(res.statusCode, 401);
  });

  it('answers 404 for a track that does not exist', async () => {
    const res = await prepare(flacId + 1000, '?quality=low');
    assert.equal(res.statusCode, 404);
  });

  it('does nothing for a track that will be served as-is', async () => {
    const res = await prepare(flacId);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'not-needed' });
    assert.equal(getActiveTranscodes(), 0);
  });

  it('leaves the only slot to a real play', async () => {
    config.maxConcurrentTranscodes = 1;
    const res = await prepare(flacId, '?quality=low');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'busy' });
    assert.equal(getActiveTranscodes(), 0);
  });

  it('converts in the background so the later stream is a cache hit', { skip: !ffmpegAvailable }, async () => {
    const res = await prepare(flacId, '?quality=low');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { status: 'started' });

    // The slot is taken a moment after the reply, so wait for the file itself.
    const expected = cacheEntryName(LOW_QUALITY_VARIANT, await stat(flacPath));
    let names: string[] = [];
    for (let i = 0; i < 200 && !names.includes(expected); i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      names = await readdir(config.transcodePath).catch(() => []);
    }
    assert.deepEqual(names, [expected]);
  });
});
