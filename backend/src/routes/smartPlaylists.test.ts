import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db/connection.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertGuest, insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/** Smart playlists over HTTP (A207): create, preview, open, edit rules, and what is refused. */

let app: FastifyInstance;
let aliceId: number;
let alice: string;
let bob: string;
let guest: string;
let tracks: number[];

const notPlayed60 = { rules: [{ field: 'lastPlayed', op: 'olderThanDays', value: 60 }], sort: 'title' };

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

beforeEach(() => {
  resetDatabase();
  const tokenFor = (u: { id: number; username: string }) => signToken({ id: u.id, username: u.username });
  const a = insertUser('alice', 'hash');
  aliceId = a.id;
  alice = tokenFor(a);
  bob = tokenFor(insertUser('bob', 'hash'));
  guest = tokenFor(insertGuest());
  const rootId = insertLibraryRoot('/library', null).id;
  tracks = [0, 1, 2].map(
    (i) =>
      upsertTrack({
        path: `/library/${i}.mp3`,
        title: `Song ${i}`,
        artistName: 'Someone',
        albumTitle: `Album ${i}`,
        albumYear: null,
        trackNumber: 1,
        duration: 100,
        format: 'MP3',
        fileSize: 1000,
        rootId,
      }).id,
  );
});

function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, auth: string, payload?: object) {
  return app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${auth}` }, payload });
}

async function makeSmart(auth = alice, rules: object = notPlayed60, name = 'Dusty') {
  const res = await call('POST', '/playlists', auth, { name, rules });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().id as number;
}

function playOnce(userId: number, trackId: number, daysAgo: number) {
  db.prepare(
    `INSERT INTO play_history (user_id, track_id, played_at, ms_played, skipped)
     VALUES (?, ?, datetime('now', ?), 1000, 0)`,
  ).run(userId, trackId, `-${daysAgo} days`);
}

describe('creating and opening', () => {
  it('creates a smart playlist and opens it filled from the rules', async () => {
    playOnce(aliceId, tracks[0], 2);
    const id = await makeSmart();
    const detail = (await call('GET', `/playlists/${id}`, alice)).json();
    assert.equal(detail.isSmart, true);
    assert.deepEqual(
      detail.tracks.map((x: { id: number }) => x.id),
      [tracks[1], tracks[2]],
    );
    assert.equal(detail.rules.rules[0].field, 'lastPlayed');
  });

  it('refills each time it opens', async () => {
    const id = await makeSmart();
    const count = async () => (await call('GET', `/playlists/${id}`, alice)).json().tracks.length;
    assert.equal(await count(), 3);
    playOnce(aliceId, tracks[1], 1);
    assert.equal(await count(), 2);
  });

  it('shows in the list with its own count, and an ordinary one stays ordinary', async () => {
    playOnce(aliceId, tracks[0], 2);
    await makeSmart();
    await call('POST', '/playlists', alice, { name: 'By hand' });
    const list = (await call('GET', '/playlists', alice)).json().playlists as {
      name: string;
      isSmart: boolean;
      trackCount: number;
    }[];
    assert.deepEqual(
      list.map((p) => [p.name, p.isSmart, p.trackCount]).sort(),
      [
        ['By hand', false, 0],
        ['Dusty', true, 2],
      ],
    );
  });

  it('keeps a Random order, and the songs a limit picks, between openings', async () => {
    const id = await makeSmart(alice, { rules: [{ field: 'myPlays', op: 'eq', value: 0 }], sort: 'random', limit: 2 });
    const ids = async () => (await call('GET', `/playlists/${id}`, alice)).json().tracks.map((x: { id: number }) => x.id);
    const first = await ids();
    assert.equal(first.length, 2);
    assert.deepEqual(await ids(), first);
    await call('PATCH', `/playlists/${id}`, alice, { name: 'Renamed' });
    assert.deepEqual(await ids(), first);
  });

  it('the list count follows a like made through the app, at once', async () => {
    await makeSmart(alice, { rules: [{ field: 'liked', op: 'is', value: true }] });
    const count = async () =>
      (await call('GET', '/playlists', alice)).json().playlists.find((p: { isSmart: boolean }) => p.isSmart).trackCount;
    assert.equal(await count(), 0);
    assert.equal((await call('PUT', `/tracks/${tracks[0]}/favorite`, alice)).statusCode, 204);
    assert.equal(await count(), 1);
  });

  it('refuses bad rules with a message', async () => {
    const res = await call('POST', '/playlists', alice, { name: 'Bad', rules: { rules: [{ field: 'nope', op: 'is', value: 1 }] } });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /Unknown rule field/);
    assert.equal((await call('GET', '/playlists', alice)).json().playlists.length, 0);
  });

  it('is private to its owner', async () => {
    const id = await makeSmart();
    assert.equal((await call('GET', `/playlists/${id}`, bob)).statusCode, 404);
  });
});

describe('preview', () => {
  it('counts and lists what the rules pick, and saves nothing', async () => {
    playOnce(aliceId, tracks[0], 2);
    const res = await call('POST', '/playlists/smart/preview', alice, { rules: notPlayed60 });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().trackCount, 2);
    assert.equal(res.json().tracks.length, 2);
    assert.equal((await call('GET', '/playlists', alice)).json().playlists.length, 0);
  });

  it('uses the caller\'s plays, not another user\'s', async () => {
    playOnce(aliceId, tracks[0], 2);
    assert.equal((await call('POST', '/playlists/smart/preview', bob, { rules: notPlayed60 })).json().trackCount, 3);
  });

  it('rejects bad rules and guests', async () => {
    assert.equal((await call('POST', '/playlists/smart/preview', alice, { rules: { rules: [] } })).statusCode, 400);
    assert.equal((await call('POST', '/playlists/smart/preview', guest, { rules: notPlayed60 })).statusCode, 403);
  });
});

describe('editing', () => {
  it('changes the rules of a smart playlist', async () => {
    const id = await makeSmart();
    const res = await call('PATCH', `/playlists/${id}`, alice, {
      rules: { rules: [{ field: 'myPlays', op: 'eq', value: 5 }] },
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await call('GET', `/playlists/${id}`, alice)).json().tracks.length, 0);
  });

  it('refuses rules on an ordinary playlist, so it never turns smart', async () => {
    const id = (await call('POST', '/playlists', alice, { name: 'By hand' })).json().id;
    const res = await call('PATCH', `/playlists/${id}`, alice, { rules: notPlayed60 });
    assert.equal(res.statusCode, 400);
    assert.equal((await call('GET', `/playlists/${id}`, alice)).json().isSmart, false);
  });

  it('refuses to go public (A210) but can still be renamed', async () => {
    const id = await makeSmart();
    assert.equal((await call('PATCH', `/playlists/${id}`, alice, { isPublic: true })).statusCode, 400);
    assert.equal((await call('PATCH', `/playlists/${id}`, alice, { name: 'Renamed' })).statusCode, 200);
    assert.equal((await call('GET', `/playlists/${id}`, alice)).json().isPublic, false);
  });

  it('refuses adding, removing and reordering tracks by hand', async () => {
    const id = await makeSmart();
    const add = await call('POST', `/playlists/${id}/tracks`, alice, { trackId: tracks[0] });
    const remove = await call('DELETE', `/playlists/${id}/tracks/${tracks[1]}`, alice);
    const reorder = await call('PATCH', `/playlists/${id}/tracks/reorder`, alice, { trackIds: tracks });
    assert.deepEqual([add.statusCode, remove.statusCode, reorder.statusCode], [409, 409, 409]);
  });
});

describe('save as playlist', () => {
  it('copy freezes what the rules pick now into an ordinary playlist', async () => {
    playOnce(aliceId, tracks[0], 2);
    const id = await makeSmart();
    const copy = await call('POST', `/playlists/${id}/copy`, alice);
    assert.equal(copy.statusCode, 201, copy.body);
    playOnce(aliceId, tracks[1], 1);

    const detail = (await call('GET', `/playlists/${copy.json().id}`, alice)).json();
    assert.equal(detail.isSmart, false);
    assert.deepEqual(
      detail.tracks.map((x: { id: number }) => x.id),
      [tracks[1], tracks[2]],
    );
    // The original moved on; the copy did not.
    assert.equal((await call('GET', `/playlists/${id}`, alice)).json().tracks.length, 1);
  });
});
