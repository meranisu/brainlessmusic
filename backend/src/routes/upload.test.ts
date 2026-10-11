import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import { findTrackById } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertUser, setAdmin } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { signToken } from '../services/token.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';

/**
 * The upload route: over the size ceiling is a clean 413 that leaves no partial file in staging, only admins may
 * upload, and only a file with real audio in it reaches the library.
 */

const LIMIT_MB = 1;
const boundary = '----brainlessmusicuploadtest';

function multipart(filename: string, bytes: Buffer): { payload: Buffer; headers: Record<string, string> } {
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, bytes, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const run = promisify(execFile);

let app: FastifyInstance;
let adminToken: string;
let memberToken: string;
let originalLimit: number;

before(async () => {
  // The limit is read when multipart is registered, so it has to be set before
  // the app is built, not before the request.
  originalLimit = config.maxUploadSizeMb;
  config.maxUploadSizeMb = LIMIT_MB;
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
  config.maxUploadSizeMb = originalLimit;
});

beforeEach(async () => {
  resetDatabase();
  const admin = insertUser('boss', await hashPassword('correct horse battery staple'));
  setAdmin('boss', true);
  adminToken = signToken({ id: admin.id, username: admin.username });
  const member = insertUser('member', await hashPassword('correct horse battery staple'));
  memberToken = signToken({ id: member.id, username: member.username });
});

function upload(filename: string, bytes: Buffer, token = adminToken) {
  const { payload, headers } = multipart(filename, bytes);
  return app.inject({
    method: 'POST',
    url: '/api/tracks/upload',
    headers: { ...headers, authorization: `Bearer ${token}` },
    payload,
  });
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function stagedFiles(): Promise<string[]> {
  try {
    return await readdir(config.uploadStagingPath);
  } catch {
    return [];
  }
}

describe('the upload size ceiling', () => {
  it('refuses a file over the limit with 413, not 500', async () => {
    const tooBig = Buffer.alloc(LIMIT_MB * 1024 * 1024 + 64 * 1024, 1);
    const { payload, headers } = multipart('huge.flac', tooBig);

    const res = await app.inject({
      method: 'POST',
      url: '/api/tracks/upload',
      headers: { ...headers, authorization: `Bearer ${adminToken}` },
      payload,
    });

    assert.equal(res.statusCode, 413, `expected 413, got ${res.statusCode}: ${res.payload.slice(0, 200)}`);
  });

  it('leaves nothing behind in staging when it refuses', async () => {
    // A rejected 1 GB upload that kept its partial file would fill the disk one
    // failure at a time.
    const before = await stagedFiles();
    const tooBig = Buffer.alloc(LIMIT_MB * 1024 * 1024 + 64 * 1024, 1);
    const { payload, headers } = multipart('huge.flac', tooBig);

    await app.inject({
      method: 'POST',
      url: '/api/tracks/upload',
      headers: { ...headers, authorization: `Bearer ${adminToken}` },
      payload,
    });

    assert.deepEqual(await stagedFiles(), before, 'the partial upload must be cleaned up');
  });

  it('still rejects an unsupported extension before size ever matters', async () => {
    const { payload, headers } = multipart('notes.txt', Buffer.from('hello'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/tracks/upload',
      headers: { ...headers, authorization: `Bearer ${adminToken}` },
      payload,
    });

    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /Unsupported file extension/);
  });
});

describe('what gets into the library', async () => {
  const ffmpegAvailable = await hasFfmpeg();

  it('refuses a text file named .mp3, and files nothing', async () => {
    // music-metadata parses this without throwing; only the missing duration gives it away.
    const before = await stagedFiles();
    const res = await upload('notes.mp3', Buffer.from('hello, this is not audio\n'));

    assert.equal(res.statusCode, 400, res.payload.slice(0, 200));
    assert.match(res.json().error, /No playable audio/);
    assert.deepEqual(await stagedFiles(), before);
  });

  it('refuses a non-admin', async () => {
    const res = await upload('song.mp3', Buffer.from('irrelevant'), memberToken);
    assert.equal(res.statusCode, 403);
  });

  it('files a real track under Artist/Album and empties staging', { skip: !ffmpegAvailable }, async () => {
    insertLibraryRoot(config.libraryPath, null);
    const dir = await makeTempDir('upload');
    try {
      const source = join(dir.path, 'source.mp3');
      await run('ffmpeg', [
        '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-metadata', 'title=Upload Test', '-metadata', 'artist=Upload Artist', '-metadata', 'album=Upload Album',
        '-c:a', 'libmp3lame', source,
      ]);

      const before = await stagedFiles();
      const res = await upload('my song.mp3', await readFile(source));

      assert.equal(res.statusCode, 201, res.payload.slice(0, 200));
      const track = findTrackById(res.json().track.id);
      assert.ok(track);
      // Repeat runs leave earlier copies in .test-tmp, so the name may carry " (n)".
      assert.match(relative(config.libraryPath, track.path), /^Upload Artist\/Upload Album\/my song( \(\d+\))?\.mp3$/);
      assert.ok((track.duration ?? 0) > 0);
      assert.deepEqual(await stagedFiles(), before);
      await unlink(track.path);
    } finally {
      await dir.cleanup();
    }
  });
});
