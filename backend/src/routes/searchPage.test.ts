import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db/connection.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertUser, setDisplayName } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/** The search page: best match first, a top result, "See all" paging, accent-blind people, and "Did you mean". */

let app: FastifyInstance;
let token: string;
let rootId: number;
let n = 0;

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

function song(title: string, artistName: string, albumTitle: string | null = null) {
  n += 1;
  return upsertTrack({
    path: `/library/${n}.mp3`,
    title,
    artistName,
    albumTitle,
    albumYear: null,
    trackNumber: 1,
    duration: 100,
    format: 'MP3',
    fileSize: 1000,
    rootId,
  }).id;
}

beforeEach(() => {
  resetDatabase();
  const user = insertUser('alice', 'hash');
  token = signToken({ id: user.id, username: user.username });
  rootId = insertLibraryRoot('/library', null).id;
});

function search(query: string) {
  return app.inject({ method: 'GET', url: `/api/search?${query}`, headers: { authorization: `Bearer ${token}` } });
}

describe('search page', () => {
  it('puts the exact name first, then names starting with it, and picks the exact artist as the top result', async () => {
    song('Song A', 'Rainbow Bridge', 'Album A');
    song('Song B', 'Rain', 'Album B');
    song('Song C', 'Purple Rain Band', 'Album C');
    const body = (await search('q=rain')).json();
    assert.deepEqual(
      body.artists.map((a: { name: string }) => a.name),
      ['Rain', 'Rainbow Bridge', 'Purple Rain Band'],
    );
    assert.equal(body.top.kind, 'artist');
    assert.equal(body.top.id, body.artists[0].id);
    assert.equal(body.suggestion, null);
  });

  it('ranks a song titled exactly the query above the rest, and makes it the top result', async () => {
    song('Rainy Days', 'Someone');
    const exact = song('Rain', 'Someone Else');
    const body = (await search('q=rain')).json();
    assert.equal(body.tracks[0].id, exact);
    assert.deepEqual(body.top, { kind: 'track', id: exact });
  });

  it('pages one kind with type, limit and offset, saying whether there is more', async () => {
    for (let i = 0; i < 5; i++) song(`Echo ${i}`, 'Echoes');
    const first = (await search('q=echo&type=tracks&limit=2')).json();
    assert.equal(first.items.length, 2);
    assert.equal(first.hasMore, true);
    const last = (await search('q=echo&type=tracks&limit=2&offset=4')).json();
    assert.equal(last.items.length, 1);
    assert.equal(last.hasMore, false);
    assert.equal((await search('q=echo&type=songs')).statusCode, 400);
    assert.equal((await search('q=echo&type=tracks&limit=-1')).statusCode, 400);
  });

  it('says on the all-kinds page when a kind has more than it shows', async () => {
    for (let i = 0; i < 21; i++) song(`Wave ${i}`, 'Surf');
    const body = (await search('q=wave')).json();
    assert.equal(body.tracks.length, 20);
    assert.equal(body.hasMore.tracks, true);
    assert.equal(body.hasMore.artists, false);
  });

  it('finds people and songs whatever the accents', async () => {
    song('Halo', 'Beyoncé');
    const bob = insertUser('bob', 'hash');
    setDisplayName(bob.id, 'Zoë');
    assert.equal((await search('q=beyonce')).json().artists[0].name, 'Beyoncé');
    assert.equal((await search('q=zoe')).json().people[0].name, 'Zoë');
  });

  it('suggests the closest name when nothing matches, and nothing when nothing is close', async () => {
    song('Help', 'The Beatles', 'Abbey Road');
    const typo = (await search('q=beatels')).json();
    assert.equal(typo.tracks.length + typo.artists.length + typo.albums.length, 0);
    assert.equal(typo.suggestion, 'Beatles');
    assert.equal((await search('q=abey%20road')).json().suggestion, 'Abbey Road');
    assert.equal((await search('q=zzzzzzzz')).json().suggestion, null);
  });

  it("never suggests a name whose songs are all hidden, and picks it up again when they're shown", async () => {
    const id = song('Secret Song', 'Hidden Band', 'Hidden Album');
    db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(id);
    assert.equal((await search('q=hiden%20band')).json().suggestion, null);
    db.prepare('UPDATE tracks SET hidden = 0 WHERE id = ?').run(id);
    assert.equal((await search('q=hiden%20band')).json().suggestion, 'Hidden Band');
  });

  it('pages without repeating a row when names tie', async () => {
    for (let i = 0; i < 7; i++) song('Same', `Artist ${i}`);
    const seen: number[] = [];
    for (let offset = 0; offset < 7; offset += 2) {
      seen.push(...(await search(`q=same&type=tracks&limit=2&offset=${offset}`)).json().items.map((t: { id: number }) => t.id));
    }
    assert.equal(new Set(seen).size, 7);
    assert.equal(seen.length, 7);
  });
});
