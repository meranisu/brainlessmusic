import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';
import { MAX_DESCRIPTION_LENGTH } from './playlists.js';

/** A playlist's description: set and cleared by its owner, shown wherever the playlist is listed, kept by a copy. */

let app: FastifyInstance;
let alice: string;
let bob: string;
let track: number;

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

beforeEach(() => {
  resetDatabase();
  const a = insertUser('alice', 'hash');
  const b = insertUser('bob', 'hash');
  alice = signToken({ id: a.id, username: a.username });
  bob = signToken({ id: b.id, username: b.username });
  const rootId = insertLibraryRoot('/library', null).id;
  track = upsertTrack({
    path: '/library/0.mp3',
    title: 'Song',
    artistName: 'Someone',
    albumTitle: null,
    albumYear: null,
    trackNumber: 1,
    duration: 100,
    format: 'MP3',
    fileSize: 1000,
    rootId,
  }).id;
});

function call(token: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
  return app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${token}` }, payload });
}

async function makePlaylist(): Promise<number> {
  return (await call(alice, 'POST', '/playlists', { name: 'Late night' })).json().id;
}

describe('playlist descriptions', () => {
  it('starts empty, then is trimmed, kept with its line breaks, and shown in the detail and the list', async () => {
    const id = await makePlaylist();
    assert.equal((await call(alice, 'GET', `/playlists/${id}`)).json().description, null);

    const res = await call(alice, 'PATCH', `/playlists/${id}`, { description: '  For the drive home.\r\nNo skips.  ' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().description, 'For the drive home.\nNo skips.');
    assert.equal((await call(alice, 'GET', `/playlists/${id}`)).json().description, 'For the drive home.\nNo skips.');
    assert.equal((await call(alice, 'GET', '/playlists')).json().playlists[0].description, 'For the drive home.\nNo skips.');
  });

  it('is cleared by null or blank text', async () => {
    const id = await makePlaylist();
    await call(alice, 'PATCH', `/playlists/${id}`, { description: 'Something' });
    assert.equal((await call(alice, 'PATCH', `/playlists/${id}`, { description: '   ' })).json().description, null);
    await call(alice, 'PATCH', `/playlists/${id}`, { description: 'Something' });
    assert.equal((await call(alice, 'PATCH', `/playlists/${id}`, { description: null })).json().description, null);
  });

  it('turns away non-text, control characters and too long with a 400, leaving the old one', async () => {
    const id = await makePlaylist();
    await call(alice, 'PATCH', `/playlists/${id}`, { description: 'Keep me' });
    for (const description of [42, 'tab\there', 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1)]) {
      assert.equal((await call(alice, 'PATCH', `/playlists/${id}`, { description })).statusCode, 400, String(description));
    }
    assert.equal((await call(alice, 'GET', `/playlists/${id}`)).json().description, 'Keep me');
    // The limit counts characters, so an emoji is one.
    const fits = '🎵'.repeat(MAX_DESCRIPTION_LENGTH);
    assert.equal((await call(alice, 'PATCH', `/playlists/${id}`, { description: fits })).statusCode, 200);
  });

  it("can only be changed by the owner, shows on a public one in From others, and goes with a copy", async () => {
    const id = await makePlaylist();
    await call(alice, 'POST', `/playlists/${id}/tracks`, { trackId: track });
    await call(alice, 'PATCH', `/playlists/${id}`, { description: 'Rainy days', isPublic: true });
    assert.equal((await call(bob, 'PATCH', `/playlists/${id}`, { description: 'Mine now' })).statusCode, 403);

    const others = (await call(bob, 'GET', '/playlists/public')).json().playlists;
    assert.equal(others[0].description, 'Rainy days');
    const aliceId = (await call(alice, 'GET', `/playlists/${id}`)).json().ownerId;
    const onProfile = (await call(bob, 'GET', `/users/${aliceId}/profile`)).json().playlists;
    assert.equal(onProfile[0].description, 'Rainy days');

    const copy = await call(bob, 'POST', `/playlists/${id}/copy`);
    assert.equal(copy.statusCode, 201);
    assert.equal(copy.json().description, 'Rainy days');
    assert.equal((await call(bob, 'GET', `/playlists/${copy.json().id}`)).json().description, 'Rainy days');
  });

  it("gives each song when it was added", async () => {
    const id = await makePlaylist();
    await call(alice, 'POST', `/playlists/${id}/tracks`, { trackId: track });
    const added = (await call(alice, 'GET', `/playlists/${id}`)).json().tracks[0].addedAt;
    assert.match(added, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
