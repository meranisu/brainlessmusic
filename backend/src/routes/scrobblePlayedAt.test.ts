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
import { parsePlayedAt } from './tracks.js';

let app: FastifyInstance;
let token: string;
let trackId: number;

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
  const rootId = insertLibraryRoot('/library', null).id;
  trackId = upsertTrack({
    path: '/library/a.mp3',
    title: 'A',
    artistName: 'Artist',
    albumTitle: 'Album',
    albumYear: null,
    trackNumber: 1,
    duration: 200,
    format: 'MP3',
    fileSize: 1000,
    rootId,
  }).id;
});

function scrobble(body: object) {
  return app.inject({
    method: 'POST',
    url: `/api/tracks/${trackId}/scrobble`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
}

function lastPlayedAt(): string | null {
  return (db.prepare('SELECT last_played_at FROM tracks WHERE id = ?').get(trackId) as { last_played_at: string | null })
    .last_played_at;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

describe('scrobble playedAt (offline plays, A87)', () => {
  it('records an offline play at the time it happened', async () => {
    const at = hoursAgo(3);
    const res = await scrobble({ msPlayed: 30_000, playedAt: at });
    assert.equal(res.statusCode, 201, res.body);
    const row = db.prepare('SELECT played_at FROM play_history WHERE id = ?').get(res.json().playId) as {
      played_at: string;
    };
    assert.equal(row.played_at, at.slice(0, 19).replace('T', ' '));
    assert.equal(lastPlayedAt(), row.played_at);
  });

  it('never moves last_played_at back for a late offline play', async () => {
    assert.equal((await scrobble({ msPlayed: 30_000 })).statusCode, 201);
    const now = lastPlayedAt();
    assert.equal((await scrobble({ msPlayed: 30_000, playedAt: hoursAgo(5) })).statusCode, 201);
    assert.equal(lastPlayedAt(), now);
    const count = db.prepare('SELECT play_count FROM tracks WHERE id = ?').get(trackId) as { play_count: number };
    assert.equal(count.play_count, 2);
  });

  it('counts an offline play sent twice only once', async () => {
    const at = hoursAgo(2);
    const first = await scrobble({ msPlayed: 30_000, playedAt: at });
    const again = await scrobble({ msPlayed: 30_000, playedAt: at });
    assert.equal(again.statusCode, 201, again.body);
    assert.equal(again.json().playId, first.json().playId);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM play_history').get() as { n: number }).n, 1);
    const count = db.prepare('SELECT play_count FROM tracks WHERE id = ?').get(trackId) as { play_count: number };
    assert.equal(count.play_count, 1);
  });

  it('treats playedAt: null as now', async () => {
    assert.equal((await scrobble({ msPlayed: 30_000, playedAt: null })).statusCode, 201);
  });

  it('refuses a time that is too old, in the future or not a time', async () => {
    for (const playedAt of [hoursAgo(31 * 24), hoursAgo(-1), 'yesterday', 12345]) {
      const res = await scrobble({ msPlayed: 30_000, playedAt });
      assert.equal(res.statusCode, 400, `playedAt ${String(playedAt)}`);
    }
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM play_history').get() as { n: number }).n, 0);
  });

  it('allows a phone clock a few minutes ahead, recorded as now', () => {
    const now = Date.parse('2026-10-11T12:00:00Z');
    assert.equal(parsePlayedAt('2026-10-11T12:03:00Z', now), '2026-10-11 12:00:00');
    assert.equal(parsePlayedAt('2026-10-11T12:10:00Z', now), null);
  });
});
