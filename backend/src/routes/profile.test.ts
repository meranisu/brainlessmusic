import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db/connection.js';
import { starTrack } from '../db/favorites.js';
import { markLessOften } from '../db/lessOften.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { recordScrobble } from '../db/plays.js';
import { insertGuest, insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/** The profile page (A167-A170): who sees what, editing your own, and the picture. */

let app: FastifyInstance;
let aliceId: number;
let alice: string;
let bob: string;
let guest: string;
let guestId: number;
let tracks: number[];

/** A 1×1 red PNG: the smallest real image ffmpeg will read. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

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
  const g = insertGuest();
  guestId = g.id;
  guest = tokenFor(g);
  const rootId = insertLibraryRoot('/library', null).id;
  tracks = [0, 1, 2].map(
    (i) =>
      upsertTrack({
        path: `/library/${i}.mp3`,
        title: `Song ${i}`,
        artistName: `Artist ${i}`,
        albumTitle: null,
        albumYear: null,
        trackNumber: 1,
        duration: 100,
        format: 'MP3',
        fileSize: 1000,
        rootId,
      }).id,
  );
});

function call(method: 'GET' | 'PUT' | 'POST' | 'PATCH', url: string, auth: string, payload?: object) {
  return app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${auth}` }, payload });
}

function multipart(bytes: Buffer) {
  const boundary = '----brainlessmusicavatartest';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="me.png"\r\nContent-Type: image/png\r\n\r\n`,
  );
  return {
    payload: Buffer.concat([head, bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('profiles', () => {
  it('shows anyone signed in an account profile, guests included', async () => {
    recordScrobble(aliceId, tracks[0], 100_000);
    recordScrobble(aliceId, tracks[0], 100_000);
    recordScrobble(aliceId, tracks[1], 100_000);
    for (const viewer of [bob, guest]) {
      const res = await call('GET', `/users/${aliceId}/profile?range=all`, viewer);
      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.name, 'alice');
      assert.equal(body.isSelf, false);
      assert.equal(body.username, undefined, 'no login name for others (A174)');
      assert.equal(body.isAdmin, undefined);
      assert.equal(body.topTracks[0].track.id, tracks[0]);
      assert.equal(body.totals.plays, 3);
    }
  });

  it('has no profile for a guest', async () => {
    assert.equal((await call('GET', `/users/${guestId}/profile`, bob)).statusCode, 404);
    const people = (await call('GET', '/people', guest)).json().people.map((p: { name: string }) => p.name);
    assert.deepEqual(people.sort(), ['alice', 'bob']);
  });

  it("shows others the owner's liked and disliked songs (A168)", async () => {
    starTrack(aliceId, tracks[0]);
    markLessOften(aliceId, tracks[1]);
    const body = (await call('GET', `/users/${aliceId}/profile`, bob)).json();
    assert.equal(body.liked.total, 1);
    assert.equal(body.liked.tracks[0].id, tracks[0]);
    assert.equal(body.disliked.total, 1);
    assert.equal(body.disliked.tracks[0].id, tracks[1]);
    assert.equal((await call('GET', `/users/${aliceId}/liked`, bob)).json().tracks.length, 1);
    assert.equal((await call('GET', `/users/${aliceId}/disliked`, guest)).json().tracks.length, 1);
  });

  it('shows others only public playlists, and you all of yours', async () => {
    const open = (await call('POST', '/playlists', alice, { name: 'Open' })).json().id;
    await call('POST', '/playlists', alice, { name: 'Secret' });
    await call('PATCH', `/playlists/${open}`, alice, { isPublic: true });
    const theirs = (await call('GET', `/users/${aliceId}/profile`, bob)).json().playlists;
    assert.deepEqual(
      theirs.map((p: { name: string }) => p.name),
      ['Open'],
    );
    const mine = (await call('GET', `/users/${aliceId}/profile`, alice)).json();
    assert.equal(mine.isSelf, true);
    assert.equal(mine.username, 'alice', 'your own keeps it');
    assert.equal(mine.playlists.length, 2);
  });

  it("leaves hidden songs out of someone else's lists", async () => {
    starTrack(aliceId, tracks[0]);
    starTrack(aliceId, tracks[1]);
    db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(tracks[1]);
    assert.equal((await call('GET', `/users/${aliceId}/profile`, bob)).json().liked.tracks.length, 1);
    assert.equal((await call('GET', `/users/${aliceId}/profile`, alice)).json().liked.tracks.length, 2);
  });

  it('finds people in search, accounts only, and returns your picture from /auth/me', async () => {
    const people = (await call('GET', '/search?q=ali', bob)).json().people;
    assert.deepEqual(
      people.map((p: { name: string }) => p.name),
      ['alice'],
    );
    assert.equal((await call('GET', '/search?q=guest', bob)).json().people.length, 0);
    assert.equal((await call('GET', '/auth/me', alice)).json().avatarId, null);
  });

  it('refuses an unknown range', async () => {
    assert.equal((await call('GET', `/users/${aliceId}/profile?range=decade`, bob)).statusCode, 400);
  });
});

describe('editing your profile', () => {
  it('saves a bio and pins, and clears them with null', async () => {
    const artistId = (db.prepare('SELECT artist_id AS a FROM tracks WHERE id = ?').get(tracks[2]) as { a: number }).a;
    const res = await call('PUT', '/me/profile', alice, {
      bio: '  hi there  ',
      favoriteTrackId: tracks[2],
      favoriteArtistId: artistId,
    });
    assert.equal(res.statusCode, 200);
    let body = (await call('GET', `/users/${aliceId}/profile`, bob)).json();
    assert.equal(body.bio, 'hi there');
    assert.equal(body.favoriteTrack.id, tracks[2]);
    assert.equal(body.favoriteArtist.id, artistId);

    await call('PUT', '/me/profile', alice, { bio: null, favoriteTrackId: null });
    body = (await call('GET', `/users/${aliceId}/profile`, bob)).json();
    assert.equal(body.bio, null);
    assert.equal(body.favoriteTrack, null);
    assert.equal(body.favoriteArtist.id, artistId, 'a field left out is left alone');
  });

  it('refuses a pin to something not in the library, and a bio that is too long', async () => {
    assert.equal((await call('PUT', '/me/profile', alice, { favoriteTrackId: 999_999 })).statusCode, 400);
    assert.equal((await call('PUT', '/me/profile', alice, { favoriteArtistId: 999_999 })).statusCode, 400);
    assert.equal((await call('PUT', '/me/profile', alice, { bio: 'x'.repeat(301) })).statusCode, 400);
  });

  it("doesn't let a guest edit a profile", async () => {
    assert.equal((await call('PUT', '/me/profile', guest, { bio: 'hi' })).statusCode, 403);
  });
});

describe('profile picture', () => {
  it('crops an upload, serves it, and removes it', async () => {
    const { payload, headers } = multipart(TINY_PNG);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/me/avatar',
      headers: { ...headers, authorization: `Bearer ${alice}` },
      payload,
    });
    assert.equal(res.statusCode, 200, res.body);
    const avatarId = res.json().avatarId as string;
    assert.match(avatarId, /^[a-f0-9]{64}$/);

    const image = await call('GET', `/users/${aliceId}/avatar`, bob);
    assert.equal(image.statusCode, 200);
    assert.equal(image.headers['content-type'], 'image/jpeg');

    assert.equal((await app.inject({ method: 'DELETE', url: '/api/me/avatar', headers: { authorization: `Bearer ${alice}` } })).statusCode, 204);
    assert.equal((await call('GET', `/users/${aliceId}/avatar`, bob)).statusCode, 404);
  });

  it('refuses a file that is not a picture', async () => {
    const { payload, headers } = multipart(Buffer.from('not an image at all'));
    const res = await app.inject({
      method: 'PUT',
      url: '/api/me/avatar',
      headers: { ...headers, authorization: `Bearer ${alice}` },
      payload,
    });
    assert.equal(res.statusCode, 400);
  });
});
