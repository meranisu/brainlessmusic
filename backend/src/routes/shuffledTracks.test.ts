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

  it('caps a page at the server-wide limit', async () => {
    addTracks(5);
    const body = (await shuffled('seed=1&limit=100000')).json() as { limit: number };
    assert.equal(body.limit, 200);
  });
});
