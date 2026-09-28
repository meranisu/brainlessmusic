import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * The rail is only correct if a jump lands on the first row of the letter it names — so the check
 * that matters is against the real listing (`GET /tracks?sort=title`), not against a hand-written
 * expectation of the order.
 */

let app: FastifyInstance;
let token: string;

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

interface Entry {
  letter: string;
  offset: number;
  count: number;
}

beforeEach(() => {
  resetDatabase();
  const user = insertUser('alice', 'hash');
  token = signToken({ id: user.id, username: user.username });

  const rootId = insertLibraryRoot('/library', null).id;
  const titles = ['1 Game', '/dev/null', '"burial"', 'Apple', 'apple pie', 'Banana', 'Zed', 'かめりあ', 'Émile'];
  titles.forEach((title, i) => {
    upsertTrack({
      path: `/library/${i}.mp3`,
      title,
      artistName: title === 'Zed' ? 'Zed Band' : `Artist ${title}`,
      albumTitle: title === 'Apple' ? 'Apple Album' : null,
      albumYear: null,
      trackNumber: 1,
      duration: 100,
      format: 'MP3',
      fileSize: 1000,
      rootId,
    });
  });
});

function letters(scope: string, auth = token) {
  return app.inject({
    method: 'GET',
    url: `/api/browse/letters?scope=${scope}`,
    headers: { authorization: `Bearer ${auth}` },
  });
}

describe('GET /api/browse/letters', () => {
  it('requires a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/browse/letters?scope=tracks' });
    assert.equal(res.statusCode, 401);
  });

  it('rejects an unknown scope', async () => {
    assert.equal((await letters('genres')).statusCode, 400);
    assert.equal((await app.inject({ method: 'GET', url: '/api/browse/letters', headers: { authorization: `Bearer ${token}` } })).statusCode, 400);
  });

  it('buckets tracks on the list order: below a, a–z, then everything above z', async () => {
    const body = (await letters('tracks')).json() as { total: number; letters: Entry[] };
    const by = new Map(body.letters.map((e) => [e.letter, e]));

    assert.equal(body.total, 9);
    assert.equal(body.letters.length, 28);
    // 1 Game, /dev/null, "burial" — none is a letter.
    assert.deepEqual(by.get('#'), { letter: '#', offset: 0, count: 3 });
    assert.deepEqual(by.get('A'), { letter: 'A', offset: 3, count: 2 });
    assert.deepEqual(by.get('B'), { letter: 'B', offset: 5, count: 1 });
    // An empty letter still says where it would start: the next row that exists.
    assert.deepEqual(by.get('C'), { letter: 'C', offset: 6, count: 0 });
    assert.deepEqual(by.get('Z'), { letter: 'Z', offset: 6, count: 1 });
    // Kana and an accented capital sort after "z" under NOCASE, which folds only ASCII.
    assert.deepEqual(by.get('…'), { letter: '…', offset: 7, count: 2 });
    assert.equal(body.letters.reduce((n, e) => n + e.count, 0), body.total);
  });

  it('every non-empty offset lands on the first row of its letter in the real listing', async () => {
    const index = (await letters('tracks')).json() as { letters: Entry[] };
    const listing = (
      await app.inject({
        method: 'GET',
        url: '/api/tracks?sort=title&limit=200',
        headers: { authorization: `Bearer ${token}` },
      })
    ).json() as { tracks: { title: string }[] };

    for (const entry of index.letters.filter((e) => e.count > 0)) {
      const landed = listing.tracks[entry.offset].title;
      const first = landed.charAt(0);
      if (entry.letter === '#') assert.ok(first.toLowerCase() < 'a', `# landed on ${landed}`);
      else if (entry.letter === '…') assert.ok(first > 'z', `… landed on ${landed}`);
      else assert.equal(first.toUpperCase(), entry.letter, `${entry.letter} landed on ${landed}`);
    }
  });

  it('indexes albums and artists over what their own lists show', async () => {
    const albums = (await letters('albums')).json() as { total: number; letters: Entry[] };
    assert.equal(albums.total, 1);
    assert.equal(albums.letters.find((e) => e.letter === 'A')?.count, 1);

    const artists = (await letters('artists')).json() as { total: number; letters: Entry[] };
    assert.equal(artists.total, 9);
    assert.equal(artists.letters.reduce((n, e) => n + e.count, 0), 9);
  });

  it('handles an empty library', async () => {
    resetDatabase();
    const user = insertUser('bob', 'hash');
    const bob = signToken({ id: user.id, username: user.username });
    const body = (await letters('tracks', bob)).json() as { total: number; letters: Entry[] };
    assert.equal(body.total, 0);
    assert.ok(body.letters.every((e) => e.offset === 0 && e.count === 0));
  });
});
