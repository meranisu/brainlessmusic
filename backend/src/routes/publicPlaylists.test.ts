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

/** Public playlists (A162-A166): who can see, play, copy and change them. */

let app: FastifyInstance;
let alice: string;
let bob: string;
let guest: string;
let admin: string;
let tracks: number[];

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
  alice = tokenFor(insertUser('alice', 'hash'));
  bob = tokenFor(insertUser('bob', 'hash'));
  guest = tokenFor(insertGuest());
  const boss = insertUser('boss', 'hash');
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(boss.id);
  admin = tokenFor(boss);
  const rootId = insertLibraryRoot('/library', null).id;
  tracks = [0, 1, 2].map(
    (i) =>
      upsertTrack({
        path: `/library/${i}.mp3`,
        title: `Song ${i}`,
        artistName: 'Someone',
        albumTitle: null,
        albumYear: null,
        trackNumber: i + 1,
        duration: 100,
        format: 'MP3',
        fileSize: 1000,
        rootId,
      }).id,
  );
});

function call(method: 'GET' | 'POST' | 'PATCH', url: string, auth: string, payload?: object) {
  return app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${auth}` }, payload });
}

/** Alice's playlist with all three songs. */
async function alicePlaylist(name = 'Road trip'): Promise<number> {
  const id = (await call('POST', '/playlists', alice, { name })).json().id as number;
  for (const trackId of tracks) await call('POST', `/playlists/${id}/tracks`, alice, { trackId });
  return id;
}

describe('public playlists', () => {
  it('is private until the owner makes it public', async () => {
    const id = await alicePlaylist();
    assert.equal((await call('GET', `/playlists/${id}`, bob)).statusCode, 404);
    assert.deepEqual((await call('GET', '/playlists/public', bob)).json().playlists, []);

    const res = await call('PATCH', `/playlists/${id}`, alice, { isPublic: true });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().isPublic, true);

    const detail = await call('GET', `/playlists/${id}`, bob);
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().isOwner, false);
    assert.equal(detail.json().ownerName, 'alice');
    assert.equal(detail.json().tracks.length, 3);
    const [listed] = (await call('GET', '/playlists/public', bob)).json().playlists;
    assert.equal(listed.id, id);
    assert.equal(listed.ownerName, 'alice');
    assert.equal(listed.trackCount, 3);
  });

  it("doesn't list your own public playlist under others", async () => {
    const id = await alicePlaylist();
    await call('PATCH', `/playlists/${id}`, alice, { isPublic: true });
    assert.deepEqual((await call('GET', '/playlists/public', alice)).json().playlists, []);
    assert.equal((await call('GET', '/playlists', alice)).json().playlists[0].isPublic, true);
  });

  it('lists the newest public first, and going private takes it off', async () => {
    const first = await alicePlaylist('First');
    const second = await alicePlaylist('Second');
    await call('PATCH', `/playlists/${second}`, alice, { isPublic: true });
    db.prepare("UPDATE playlists SET public_at = datetime('now', '-1 hour') WHERE id = ?").run(second);
    await call('PATCH', `/playlists/${first}`, alice, { isPublic: true });
    const ids = (await call('GET', '/playlists/public', bob)).json().playlists.map((p: { id: number }) => p.id);
    assert.deepEqual(ids, [first, second]);

    await call('PATCH', `/playlists/${first}`, alice, { isPublic: false });
    const after = (await call('GET', '/playlists/public', bob)).json().playlists.map((p: { id: number }) => p.id);
    assert.deepEqual(after, [second]);
    assert.equal((await call('GET', `/playlists/${first}`, bob)).statusCode, 404);
  });

  it("keeps someone else's public playlist read-only", async () => {
    const id = await alicePlaylist();
    await call('PATCH', `/playlists/${id}`, alice, { isPublic: true });
    assert.equal((await call('PATCH', `/playlists/${id}`, bob, { name: 'Mine now' })).statusCode, 403);
    assert.equal((await call('PATCH', `/playlists/${id}`, bob, { isPublic: false })).statusCode, 403);
    assert.equal((await call('POST', `/playlists/${id}/tracks`, bob, { trackId: tracks[0] })).statusCode, 403);
  });

  it('saves a private copy with the same songs in the same order', async () => {
    const id = await alicePlaylist();
    await call('PATCH', `/playlists/${id}`, alice, { isPublic: true });
    const res = await call('POST', `/playlists/${id}/copy`, bob);
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().name, 'Road trip (copy)');
    assert.equal(res.json().isPublic, false);

    const copy = (await call('GET', `/playlists/${res.json().id}`, bob)).json();
    assert.equal(copy.isOwner, true);
    assert.deepEqual(
      copy.tracks.map((t: { id: number }) => t.id),
      tracks,
    );
    // Editing the copy leaves the original alone.
    await call('PATCH', `/playlists/${copy.id}`, bob, { name: 'Bob mix' });
    assert.equal((await call('GET', `/playlists/${id}`, alice)).json().name, 'Road trip');
  });

  it("refuses to copy a private playlist of someone else's", async () => {
    const id = await alicePlaylist();
    assert.equal((await call('POST', `/playlists/${id}/copy`, bob)).statusCode, 404);
  });

  it('lets a guest see and play a public playlist, not copy it', async () => {
    const id = await alicePlaylist();
    await call('PATCH', `/playlists/${id}`, alice, { isPublic: true });
    assert.equal((await call('GET', '/playlists/public', guest)).json().playlists.length, 1);
    assert.equal((await call('GET', `/playlists/${id}`, guest)).statusCode, 200);
    assert.equal((await call('POST', `/playlists/${id}/copy`, guest)).statusCode, 403);
  });

  it("leaves hidden songs out of someone else's playlist and its copy, unless an admin", async () => {
    const id = await alicePlaylist();
    await call('PATCH', `/playlists/${id}`, alice, { isPublic: true });
    db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(tracks[1]);

    assert.equal((await call('GET', `/playlists/${id}`, alice)).json().tracks.length, 3);
    assert.equal((await call('GET', `/playlists/${id}`, bob)).json().tracks.length, 2);
    assert.equal((await call('GET', '/playlists/public', bob)).json().playlists[0].trackCount, 2);
    assert.equal((await call('GET', `/playlists/${id}`, admin)).json().tracks.length, 3);

    const copyId = (await call('POST', `/playlists/${id}/copy`, bob)).json().id;
    const copied = (await call('GET', `/playlists/${copyId}`, bob)).json().tracks.map((t: { id: number }) => t.id);
    assert.deepEqual(copied, [tracks[0], tracks[2]]);
  });

  it('refuses an isPublic that is not true or false', async () => {
    const id = await alicePlaylist();
    assert.equal((await call('PATCH', `/playlists/${id}`, alice, { isPublic: 'yes' })).statusCode, 400);
    assert.equal((await call('PATCH', `/playlists/${id}`, alice, {})).statusCode, 400);
  });
});

describe('search finds playlists', () => {
  it("finds your own and other people's public ones, not their private ones", async () => {
    const shared = await alicePlaylist('Night drive');
    await alicePlaylist('Night secret');
    await call('PATCH', `/playlists/${shared}`, alice, { isPublic: true });
    const bobsOwn = (await call('POST', '/playlists', bob, { name: 'Night bus' })).json().id;

    const found = (await call('GET', '/search?q=night', bob)).json().playlists;
    assert.deepEqual(
      found.map((p: { id: number }) => p.id),
      [bobsOwn, shared],
    );
    assert.equal(found[1].ownerName, 'alice');
    assert.equal(found[0].isOwner, true);
    assert.equal(found[1].isOwner, false);
  });

  it('treats % and _ in the query as plain characters', async () => {
    const id = await alicePlaylist('100% hits');
    await alicePlaylist('100 hits');
    await call('PATCH', `/playlists/${id}`, alice, { isPublic: true });
    const found = (await call('GET', `/search?q=${encodeURIComponent('100%')}`, alice)).json().playlists;
    assert.deepEqual(
      found.map((p: { name: string }) => p.name),
      ['100% hits'],
    );
  });
});
