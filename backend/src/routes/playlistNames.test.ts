import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';
import { MAX_NAME_LENGTH } from './playlists.js';

/** Playlist names are checked on create and rename (S21), and the list can say which playlists hold a song. */

let app: FastifyInstance;
let alice: string;
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
  const user = insertUser('alice', 'hash');
  alice = signToken({ id: user.id, username: user.username });
  const rootId = insertLibraryRoot('/library', null).id;
  tracks = [0, 1].map(
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

function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
  return app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${alice}` }, payload });
}

describe('playlist names', () => {
  it('trims a name and keeps it', async () => {
    const res = await call('POST', '/playlists', { name: '  Late night  ' });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().name, 'Late night');
  });

  it('turns away a blank, non-text, too long or multi-line name with a 400', async () => {
    for (const name of ['   ', 42, null, 'a'.repeat(MAX_NAME_LENGTH + 1), 'two\nlines', 'tab\there']) {
      const res = await call('POST', '/playlists', { name });
      assert.equal(res.statusCode, 400, `name ${JSON.stringify(name)}`);
      assert.ok(res.json().error, `name ${JSON.stringify(name)} has a message`);
    }
  });

  it('counts characters, not UTF-16 units, so emoji and CJK names fit the limit', async () => {
    const res = await call('POST', '/playlists', { name: '🎵'.repeat(MAX_NAME_LENGTH) });
    assert.equal(res.statusCode, 201);
  });

  it('checks a rename the same way and leaves the old name on a bad one', async () => {
    const id = (await call('POST', '/playlists', { name: 'Gym' })).json().id as number;
    assert.equal((await call('PATCH', `/playlists/${id}`, { name: 'x'.repeat(MAX_NAME_LENGTH + 1) })).statusCode, 400);
    assert.equal((await call('PATCH', `/playlists/${id}`, { name: 7 })).statusCode, 400);
    assert.equal((await call('GET', `/playlists/${id}`)).json().name, 'Gym');

    const renamed = await call('PATCH', `/playlists/${id}`, { name: ' Gym, heavy ' });
    assert.equal(renamed.statusCode, 200);
    assert.equal(renamed.json().name, 'Gym, heavy');
  });

  it('keeps a copy of a full-length name within the limit', async () => {
    const id = (await call('POST', '/playlists', { name: 'n'.repeat(MAX_NAME_LENGTH) })).json().id as number;
    const copy = await call('POST', `/playlists/${id}/copy`);
    assert.equal(copy.statusCode, 201);
    assert.ok([...copy.json().name].length <= MAX_NAME_LENGTH);
    assert.ok(copy.json().name.endsWith(' (copy)'));
  });
});

describe('GET /playlists?trackId=', () => {
  it('marks the playlists that already hold the song', async () => {
    const withIt = (await call('POST', '/playlists', { name: 'Has it' })).json().id as number;
    const without = (await call('POST', '/playlists', { name: 'Has the other' })).json().id as number;
    const empty = (await call('POST', '/playlists', { name: 'Empty' })).json().id as number;
    await call('POST', `/playlists/${withIt}/tracks`, { trackId: tracks[0] });
    await call('POST', `/playlists/${withIt}/tracks`, { trackId: tracks[1] });
    await call('POST', `/playlists/${without}/tracks`, { trackId: tracks[1] });

    const listed = (await call('GET', `/playlists?trackId=${tracks[0]}`)).json().playlists as {
      id: number;
      hasTrack: boolean;
      trackCount: number;
    }[];
    const byId = new Map(listed.map((p) => [p.id, p]));
    assert.equal(byId.get(withIt)!.hasTrack, true);
    assert.equal(byId.get(withIt)!.trackCount, 2);
    assert.equal(byId.get(without)!.hasTrack, false);
    assert.equal(byId.get(empty)!.hasTrack, false);
  });

  it('reorders to exactly the current songs and turns away any other set', async () => {
    const id = (await call('POST', '/playlists', { name: 'Order' })).json().id as number;
    await call('POST', `/playlists/${id}/tracks`, { trackId: tracks[0] });
    await call('POST', `/playlists/${id}/tracks`, { trackId: tracks[1] });
    const reordered = await call('PATCH', `/playlists/${id}/tracks/reorder`, { trackIds: [tracks[1], tracks[0]] });
    assert.equal(reordered.statusCode, 200, reordered.body);
    assert.deepEqual(
      (reordered.json().tracks as { id: number }[]).map((t) => t.id),
      [tracks[1], tracks[0]],
    );
    for (const trackIds of [[tracks[0]], [tracks[0], tracks[0]], [tracks[0], tracks[1], tracks[1]]]) {
      assert.equal((await call('PATCH', `/playlists/${id}/tracks/reorder`, { trackIds })).statusCode, 400);
    }
  });

  it('leaves hasTrack out without a trackId, and rejects a bad one', async () => {
    await call('POST', '/playlists', { name: 'Any' });
    const plain = (await call('GET', '/playlists')).json().playlists;
    assert.equal('hasTrack' in plain[0], false);
    for (const bad of ['abc', '0', '-1', '']) {
      assert.equal((await call('GET', `/playlists?trackId=${bad}`)).statusCode, 400, `trackId=${bad}`);
    }
  });
});
