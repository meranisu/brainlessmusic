import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import { insertUser, setAdmin } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/** The upload size ceiling: over it is a clean 413 that leaves no partial file in staging. */

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

let app: FastifyInstance;
let adminToken: string;
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
});

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
