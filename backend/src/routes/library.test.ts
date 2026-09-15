import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { insertUser, setAdmin } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { signToken } from '../services/token.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';

/**
 * `GET /library/browse` — the directory listing behind Options' "Browse…"
 * button. Admin gating is covered by `api.test.ts`'s route-coverage lists;
 * this file is the actual filesystem behavior.
 */

let app: FastifyInstance;
let cleanup: () => Promise<void>;
let root: string;
let adminToken: string;
let listenerToken: string;

before(async () => {
  app = buildApp();
  await app.ready();

  const temp = await makeTempDir('browse');
  cleanup = temp.cleanup;
  root = temp.path;

  // A real, small tree: two subdirectories and one file, so "directories
  // only" is an actual assertion rather than an assumption.
  await mkdir(join(root, 'sub-a'));
  await mkdir(join(root, 'sub-b'));
  await writeFile(join(root, 'not-a-directory.txt'), 'x');
});

after(async () => {
  await app.close();
  await cleanup();
});

beforeEach(async () => {
  resetDatabase();

  const hash = await hashPassword('correct horse battery staple');
  const listenerRow = insertUser('listener', hash);
  const adminRow = insertUser('boss', hash);
  setAdmin('boss', true);

  listenerToken = signToken({ id: listenerRow.id, username: listenerRow.username });
  adminToken = signToken({ id: adminRow.id, username: adminRow.username });
});

describe('GET /library/browse', () => {
  it('lists only the subdirectories of the given path, sorted', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/library/browse?path=${encodeURIComponent(root)}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.path, root);
    assert.deepEqual(
      body.entries.map((e: { name: string }) => e.name),
      ['sub-a', 'sub-b'],
    );
    assert.equal(body.entries[0].path, join(root, 'sub-a'));
  });

  it('reports the parent directory, and null at the filesystem root', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/library/browse?path=${encodeURIComponent(join(root, 'sub-a'))}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.json().parent, root);

    const atRoot = await app.inject({
      method: 'GET',
      url: '/api/library/browse?path=/',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(atRoot.json().parent, null);
  });

  it('defaults to / when no path is given', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/library/browse',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().path, '/');
  });

  it('400s on a path that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/library/browse?path=${encodeURIComponent(join(root, 'nowhere'))}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 400);
  });

  it('400s on a path that is a file, not a directory', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/library/browse?path=${encodeURIComponent(join(root, 'not-a-directory.txt'))}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 400);
  });

  it('refuses a signed-in non-admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/library/browse?path=${encodeURIComponent(root)}`,
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    assert.equal(res.statusCode, 403);
  });
});

describe('POST /library/roots', () => {
  it('rejects a folder with no music files, and leaves nothing registered', async () => {
    const temp = await makeTempDir('root-empty');
    try {
      await writeFile(join(temp.path, 'readme.txt'), 'not music');

      const res = await app.inject({
        method: 'POST',
        url: '/api/library/roots',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { path: temp.path },
      });
      assert.equal(res.statusCode, 400);
      assert.match(res.json().error, /no music files found/i);

      const list = await app.inject({
        method: 'GET',
        url: '/api/library/roots',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.ok(
        !list.json().roots.some((r: { path: string }) => r.path === temp.path),
        'a rejected folder must not end up registered',
      );
    } finally {
      await temp.cleanup();
    }
  });

  it('accepts a folder that has at least one audio-extension file', async () => {
    const temp = await makeTempDir('root-with-music');
    try {
      // Content doesn't need to be real audio — this is "does the folder
      // contain candidates at all", the same thing `filesFound` already
      // counts; whether each one's tags actually parse is a separate,
      // per-file concern the scan already reports.
      await writeFile(join(temp.path, 'track.mp3'), 'not real audio bytes');

      const res = await app.inject({
        method: 'POST',
        url: '/api/library/roots',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { path: temp.path },
      });
      assert.equal(res.statusCode, 201, JSON.stringify(res.json()));
      assert.equal(res.json().root.path, temp.path);
    } finally {
      await temp.cleanup();
    }
  });
});
