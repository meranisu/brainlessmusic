import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db/connection.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

let app: FastifyInstance;
let token: string;
let userId: number;
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

function shuffled(query: string) {
  return app.inject({ method: 'GET', url: `/api/browse/shuffled?${query}`, headers: { authorization: `Bearer ${token}` } });
}

describe('GET /api/browse/shuffled', () => {
  it('requires a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/browse/shuffled?seed=1' });
    assert.equal(res.statusCode, 401);
  });

  it('rejects a missing or malformed seed', async () => {
    for (const q of ['', 'seed=abc', 'seed=-1', 'seed=1.5', 'seed=99999999999']) {
      assert.equal((await shuffled(q)).statusCode, 400, q);
    }
  });

  it('walks the whole library once, in pages, with no repeats and no gaps', async () => {
    const ids = addTracks(45);
    const seen: number[] = [];
    for (let offset = 0; offset < 45; offset += 20) {
      const body = (await shuffled(`seed=5&offset=${offset}&limit=20`)).json() as { total: number; tracks: { id: number }[] };
      assert.equal(body.total, 45);
      seen.push(...body.tracks.map((t) => t.id));
    }
    assert.equal(seen.length, 45);
    assert.deepEqual([...seen].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
  });

  it('gives the same order for the same seed and a different one for another', async () => {
    addTracks(30);
    const order = async (seed: number) =>
      ((await shuffled(`seed=${seed}&limit=30`)).json() as { tracks: { id: number }[] }).tracks.map((t) => t.id);
    assert.deepEqual(await order(11), await order(11));
    assert.notDeepEqual(await order(11), await order(12));
  });

  it('does not offer hidden or missing tracks, and returns nothing past the end', async () => {
    const ids = addTracks(6);
    db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(ids[0]);
    db.prepare("UPDATE tracks SET missing_since = datetime('now') WHERE id = ?").run(ids[1]);

    const all = (await shuffled('seed=3&limit=50')).json() as { total: number; tracks: { id: number }[] };
    assert.equal(all.total, 4);
    assert.ok(!all.tracks.some((t) => t.id === ids[0] || t.id === ids[1]));

    const past = (await shuffled('seed=3&offset=100&limit=50')).json() as { total: number; tracks: unknown[] };
    assert.equal(past.total, 4);
    assert.equal(past.tracks.length, 0);
  });

  it('rejects an unknown mode or a malformed asOf', async () => {
    addTracks(3);
    for (const q of ['seed=1&mode=loud', 'seed=1&mode=rediscover&asOf=soon', 'seed=1&mode=rediscover&asOf=-5']) {
      assert.equal((await shuffled(q)).statusCode, 400, q);
    }
  });

  it('albums: plays whole albums in track order, every song once', async () => {
    const add = (album: string | null, n: number, trackNumber: number | null) =>
      upsertTrack({
        path: `/library/${album}-${n}.mp3`,
        title: `${album} ${n}`,
        artistName: 'Band',
        albumTitle: album,
        albumYear: null,
        trackNumber,
        duration: 100,
        format: 'MP3',
        fileSize: 1000,
        rootId,
      }).id;
    // Added out of order, so track order has to come from the numbers.
    const a = [add('A', 3, 3), add('A', 1, 1), add('A', 2, 2)];
    const b = [add('B', 2, 2), add('B', 1, 1)];
    const single = add(null, 1, null);

    for (const seed of [1, 2, 3, 4]) {
      const body = (await shuffled(`seed=${seed}&mode=albums&limit=50`)).json() as { total: number; tracks: { id: number }[] };
      const ids = body.tracks.map((t) => t.id);
      assert.equal(body.total, 6);
      assert.deepEqual([...ids].sort((x, y) => x - y), [...a, ...b, single].sort((x, y) => x - y));
      const inOrder = (album: number[]) => {
        const at = ids.indexOf(album[0]);
        assert.deepEqual(ids.slice(at, at + album.length), album, `seed ${seed}: ${ids}`);
      };
      inOrder([a[1], a[2], a[0]]);
      inOrder([b[1], b[0]]);
    }
  });

  it('rediscover: songs not played for a long time come first, and later plays do not move them', async () => {
    const ids = addTracks(40);
    const recent = ids.slice(0, 20);
    const play = db.prepare('INSERT INTO play_history (user_id, track_id, played_at) VALUES (?, ?, ?)');
    for (const id of recent) play.run(userId, id, '2026-01-01 10:00:00');
    const asOf = Date.parse('2026-01-01T12:00:00Z') / 1000;

    let recentInFirstHalf = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const body = (await shuffled(`seed=${seed}&mode=rediscover&asOf=${asOf}&limit=50`)).json() as { tracks: { id: number }[] };
      const firstHalf = body.tracks.slice(0, 20).map((t) => t.id);
      assert.equal(body.tracks.length, 40);
      recentInFirstHalf += firstHalf.filter((id) => recent.includes(id)).length;
    }
    // Plain random would put about half of them there (100 of 200); weighted, far fewer.
    assert.ok(recentInFirstHalf < 40, `recent songs in the first half: ${recentInFirstHalf} of 200`);

    const order = async () =>
      ((await shuffled(`seed=7&mode=rediscover&asOf=${asOf}&limit=50`)).json() as { tracks: { id: number }[] }).tracks.map((t) => t.id);
    const before = await order();
    play.run(userId, ids[39], '2026-01-01 13:00:00');
    assert.deepEqual(await order(), before);
  });

  it('caps a page at the server-wide limit', async () => {
    addTracks(5);
    const body = (await shuffled('seed=1&limit=100000')).json() as { limit: number };
    assert.equal(body.limit, 200);
  });
});
