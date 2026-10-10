import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db/connection.js';
import { keptThisPass } from '../db/lessOften.js';
import { deleteTrackRow, upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { deleteUser, insertGuest, insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

let app: FastifyInstance;
let userId: number;
let token: string;
let otherToken: string;
let guestToken: string;
let rootId: number;

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

beforeEach(() => {
  resetDatabase();
  const user = insertUser('alice', 'hash');
  userId = user.id;
  token = signToken({ id: user.id, username: user.username });
  const other = insertUser('bob', 'hash');
  otherToken = signToken({ id: other.id, username: other.username });
  const guest = insertGuest();
  guestToken = signToken({ id: guest.id, username: guest.username });
  rootId = insertLibraryRoot('/library', null).id;
});

function addTracks(count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    upsertTrack({
      path: `/library/${i}.mp3`,
      title: `Song ${i}`,
      artistName: `Artist ${i % 5}`,
      albumTitle: null,
      albumYear: null,
      trackNumber: 1,
      duration: 100,
      format: 'MP3',
      fileSize: 1000,
      rootId,
    }).id,
  );
}

function call(method: 'GET' | 'PUT' | 'DELETE', url: string, auth = token) {
  return app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${auth}` } });
}

async function ids(auth = token): Promise<number[]> {
  return ((await call('GET', '/me/less-often/ids', auth)).json() as { trackIds: number[] }).trackIds;
}

describe('less often', () => {
  it('marks and unmarks a song, idempotently, per account', async () => {
    const [a, b] = addTracks(2);
    assert.equal((await call('PUT', `/tracks/${a}/less-often`)).statusCode, 204);
    assert.equal((await call('PUT', `/tracks/${a}/less-often`)).statusCode, 204);
    await call('PUT', `/tracks/${b}/less-often`);
    assert.deepEqual(await ids(), [a, b]);
    assert.deepEqual(await ids(otherToken), []);

    assert.equal((await call('DELETE', `/tracks/${a}/less-often`)).statusCode, 204);
    assert.deepEqual(await ids(), [b]);
  });

  it('404s an unknown track and clears every mark at once', async () => {
    const [a, b] = addTracks(2);
    assert.equal((await call('PUT', '/tracks/9999/less-often')).statusCode, 404);
    await call('PUT', `/tracks/${a}/less-often`);
    await call('PUT', `/tracks/${b}/less-often`);
    const res = await call('DELETE', '/me/less-often');
    assert.deepEqual(res.json(), { cleared: 2 });
    assert.deepEqual(await ids(), []);
  });

  it('is accounts only', async () => {
    const [a] = addTracks(1);
    assert.equal((await call('PUT', `/tracks/${a}/less-often`, guestToken)).statusCode, 403);
    assert.equal((await call('GET', '/me/less-often/ids', guestToken)).statusCode, 403);
  });

  it('goes with the user or the track when either is deleted', async () => {
    const [a, b] = addTracks(2);
    await call('PUT', `/tracks/${a}/less-often`);
    await call('PUT', `/tracks/${b}/less-often`);
    deleteTrackRow(a);
    assert.deepEqual(await ids(), [b]);
    assert.ok(deleteUser(userId));
    assert.equal((db.prepare('SELECT COUNT(*) c FROM less_often').get() as { c: number }).c, 0);
  });

  it('keeps a marked song in about one shuffle pass in four, only for the account that marked it', async () => {
    const [marked] = addTracks(10);
    await call('PUT', `/tracks/${marked}/less-often`);
    let kept = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const body = (await call('GET', `/browse/shuffled?seed=${seed}&limit=50`)).json() as {
        total: number;
        tracks: { id: number }[];
      };
      const has = body.tracks.some((t) => t.id === marked);
      assert.equal(has, keptThisPass(marked, seed), `seed ${seed}`);
      assert.equal(body.total, has ? 10 : 9);
      if (has) kept++;
    }
    assert.ok(kept > 60 && kept < 140, `kept in ${kept} of 400 passes`);

    const other = (await call('GET', '/browse/shuffled?seed=2&limit=50', otherToken)).json() as { total: number };
    assert.equal(other.total, 10);
  });
});
