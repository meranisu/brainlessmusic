import assert from 'node:assert/strict';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { listFavoriteTrackIdsForUser, starTrack } from '../db/favorites.js';
import { findTrackById, upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertUser, setAdmin } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { signToken } from '../services/token.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';

/** `PATCH /tracks` and `POST /tracks/delete`, the Full view's bulk actions (A54). Admin gating is in `api.test.ts`. */

let app: FastifyInstance;
let adminToken: string;
let adminId: number;
let rootId: number;

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

beforeEach(async () => {
  resetDatabase();
  const admin = insertUser('boss', await hashPassword('correct horse battery staple'));
  setAdmin('boss', true);
  adminId = admin.id;
  adminToken = signToken({ id: admin.id, username: admin.username });
  rootId = insertLibraryRoot('/bulk-root', null).id;
});

function track(path: string) {
  return upsertTrack({
    path,
    title: 'x',
    artistName: null,
    albumTitle: null,
    albumYear: null,
    trackNumber: null,
    duration: null,
    format: 'mp3',
    fileSize: 1,
    rootId,
  });
}

function send(method: 'PATCH' | 'POST', url: string, payload: unknown) {
  return app.inject({ method, url, headers: { authorization: `Bearer ${adminToken}` }, payload: payload as object });
}

describe('PATCH /tracks', () => {
  it('hides and un-hides every listed track in one request, skipping unknown ids', async () => {
    const a = track('/bulk-root/a.mp3');
    const b = track('/bulk-root/b.mp3');
    const c = track('/bulk-root/c.mp3');

    const res = await send('PATCH', '/api/tracks', { ids: [a.id, b.id, 999999], hidden: true });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { updated: 2 });
    assert.equal(findTrackById(a.id)?.hidden, 1);
    assert.equal(findTrackById(b.id)?.hidden, 1);
    assert.equal(findTrackById(c.id)?.hidden, 0);

    await send('PATCH', '/api/tracks', { ids: [a.id], hidden: false });
    assert.equal(findTrackById(a.id)?.hidden, 0);
  });

  it('400s on bad input', async () => {
    const a = track('/bulk-root/a.mp3');
    for (const payload of [
      { hidden: true },
      { ids: [], hidden: true },
      { ids: [a.id, 'x'], hidden: true },
      { ids: [a.id, 0], hidden: true },
      { ids: [a.id] },
      { ids: [a.id], hidden: 'yes' },
      { ids: Array.from({ length: 5001 }, (_, i) => i + 1), hidden: true },
    ]) {
      const res = await send('PATCH', '/api/tracks', payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload).slice(0, 80));
    }
  });
});

describe('POST /tracks/delete', () => {
  it('deletes files and rows (with favorites), skips unknown ids, and reports a file it could not remove', async () => {
    const temp = await makeTempDir('bulk-delete');
    try {
      const fileA = join(temp.path, 'a.mp3');
      const fileB = join(temp.path, 'b.mp3');
      await writeFile(fileA, 'x');
      await writeFile(fileB, 'x');
      // A directory where the file should be: unlink fails with something other than ENOENT.
      const stuck = join(temp.path, 'stuck.mp3');
      await mkdir(stuck);

      const a = track(fileA);
      const b = track(fileB);
      const gone = track(join(temp.path, 'already-gone.mp3'));
      const s = track(stuck);
      const kept = track(join(temp.path, 'kept.mp3'));
      starTrack(adminId, a.id);
      starTrack(adminId, kept.id);

      const res = await send('POST', '/api/tracks/delete', { ids: [a.id, b.id, gone.id, s.id, 999999] });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.json(), { deleted: [a.id, b.id, gone.id], failed: [s.id] });

      for (const id of [a.id, b.id, gone.id]) assert.equal(findTrackById(id), undefined);
      assert.ok(findTrackById(s.id), 'a track whose file could not be removed keeps its row');
      assert.ok(findTrackById(kept.id));
      assert.deepEqual(listFavoriteTrackIdsForUser(adminId), [kept.id]);
      await assert.rejects(access(fileA));
      await assert.rejects(access(fileB));
    } finally {
      await temp.cleanup();
    }
  });

  it('400s on a missing or empty id list', async () => {
    for (const payload of [{}, { ids: [] }, { ids: 'all' }]) {
      const res = await send('POST', '/api/tracks/delete', payload);
      assert.equal(res.statusCode, 400);
    }
  });
});
