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
import { insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/** Hidden songs on someone else's profile (A34): left out of the lists, the totals, the top lists and the pin. */

let app: FastifyInstance;
let aliceId: number;
let alice: string;
let bob: string;
let admin: string;
let visible: number;
let hidden: number;

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
  const root = insertUser('root', 'hash');
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(root.id);
  admin = tokenFor(root);
  const rootId = insertLibraryRoot('/library', null).id;
  const song = (i: number) =>
    upsertTrack({
      path: `/library/${i}.mp3`,
      title: `Song ${i}`,
      artistName: `Artist ${i}`,
      albumTitle: `Album ${i}`,
      albumYear: null,
      trackNumber: 1,
      duration: 100,
      format: 'MP3',
      fileSize: 1000,
      rootId,
    }).id;
  visible = song(0);
  hidden = song(1);
  db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(hidden);
});

function get(url: string, auth: string) {
  return app.inject({ method: 'GET', url: `/api${url}`, headers: { authorization: `Bearer ${auth}` } });
}

describe("hidden songs on someone else's profile", () => {
  it('leave the liked and disliked totals, so a page never comes back short', async () => {
    starTrack(aliceId, visible);
    starTrack(aliceId, hidden);
    markLessOften(aliceId, hidden);

    const seen = (await get(`/users/${aliceId}/profile`, bob)).json();
    assert.equal(seen.liked.total, 1);
    assert.equal(seen.liked.tracks.length, 1);
    assert.equal(seen.disliked.total, 0);
    assert.equal(seen.disliked.tracks.length, 0);

    const liked = (await get(`/users/${aliceId}/liked?limit=1&offset=0`, bob)).json();
    assert.equal(liked.total, 1);
    assert.deepEqual(liked.tracks.map((t: { id: number }) => t.id), [visible]);
    assert.equal((await get(`/users/${aliceId}/disliked`, bob)).json().total, 0);
  });

  it('leave the top songs, artists and albums', async () => {
    recordScrobble(aliceId, visible, 100_000);
    recordScrobble(aliceId, hidden, 100_000);
    recordScrobble(aliceId, hidden, 100_000);

    const seen = (await get(`/users/${aliceId}/profile`, bob)).json();
    assert.deepEqual(seen.topTracks.map((t: { track: { id: number } }) => t.track.id), [visible]);
    assert.deepEqual(seen.topArtists.map((a: { name: string }) => a.name), ['Artist 0']);
    assert.deepEqual(seen.topAlbums.map((a: { title: string }) => a.title), ['Album 0']);
  });

  it('are not shown as the pinned favourite', async () => {
    db.prepare('UPDATE users SET favorite_track_id = ? WHERE id = ?').run(hidden, aliceId);
    assert.equal((await get(`/users/${aliceId}/profile`, bob)).json().favoriteTrack, null);
    assert.equal((await get(`/users/${aliceId}/profile`, alice)).json().favoriteTrack.id, hidden);
  });

  it('stay for the owner and for an admin', async () => {
    starTrack(aliceId, visible);
    starTrack(aliceId, hidden);
    recordScrobble(aliceId, hidden, 100_000);
    for (const viewer of [alice, admin]) {
      const seen = (await get(`/users/${aliceId}/profile`, viewer)).json();
      assert.equal(seen.liked.total, 2);
      assert.equal(seen.liked.tracks.length, 2);
      assert.equal(seen.topArtists.length, 1);
    }
  });
});
