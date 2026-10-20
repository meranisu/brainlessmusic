import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db/connection.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { getOnThisDay } from '../db/onThisDay.js';
import { insertGuest, insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

let app: FastifyInstance;
let token: string;
let guestToken: string;
let rootId: number;
let userId: number;
let otherId: number;

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
  otherId = insertUser('bob', 'hash').id;
  const guest = insertGuest();
  guestToken = signToken({ id: guest.id, username: guest.username });
  rootId = insertLibraryRoot('/library', null).id;
});

function addTrack(title: string): number {
  return upsertTrack({
    path: `/library/${title}.mp3`,
    title,
    artistName: 'Artist',
    albumTitle: 'Album',
    albumYear: null,
    trackNumber: 1,
    duration: 200,
    format: 'MP3',
    fileSize: 1000,
    rootId,
  }).id;
}

/** Inserts a play at [at] (SQLite UTC text). */
function playAt(trackId: number, at: string, user = userId, skipped = 0): void {
  db.prepare('INSERT INTO play_history (user_id, track_id, played_at, ms_played, skipped) VALUES (?, ?, ?, 30000, ?)').run(
    user,
    trackId,
    at,
    skipped,
  );
}

const titles = (year: { tracks: { title: string }[] }) => year.tracks.map((t) => t.title);

describe('getOnThisDay', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');

  it('groups past years newest first, most played first, and leaves out this year', () => {
    const a = addTrack('A');
    const b = addTrack('B');
    playAt(a, '2024-10-21 09:00:00');
    playAt(b, '2024-10-21 10:00:00');
    playAt(b, '2024-10-21 11:00:00');
    playAt(a, '2025-10-21 08:00:00');
    playAt(a, '2026-10-21 08:00:00');
    playAt(a, '2025-10-22 08:00:00');

    const result = getOnThisDay(userId, 'UTC', now);
    assert.equal(result.date, '10-21');
    assert.deepEqual(
      result.years.map((y) => [y.year, y.yearsAgo]),
      [
        [2025, 1],
        [2024, 2],
      ],
    );
    assert.deepEqual(titles(result.years[1]), ['B', 'A']);
  });

  it('matches the local date, not the UTC one', () => {
    const a = addTrack('A');
    const b = addTrack('B');
    // 2025-10-21 01:00 in Kuala Lumpur (UTC+8) is still the 20th in UTC.
    playAt(a, '2025-10-20 17:00:00');
    // 2025-10-21 23:00 UTC is already the 22nd there.
    playAt(b, '2025-10-21 23:00:00');

    const result = getOnThisDay(userId, 'Asia/Kuala_Lumpur', now);
    assert.deepEqual(titles(result.years[0]), ['A']);
  });

  it('leaves out skips and other users', () => {
    const a = addTrack('A');
    playAt(a, '2025-10-21 08:00:00', userId, 1);
    playAt(a, '2025-10-21 09:00:00', otherId);
    assert.deepEqual(getOnThisDay(userId, 'UTC', now).years, []);
  });

  it('uses Feb 28 for Feb 29 in years without one', () => {
    const a = addTrack('A');
    playAt(a, '2027-02-28 08:00:00');
    const result = getOnThisDay(userId, 'UTC', Date.parse('2028-02-29T12:00:00Z'));
    assert.equal(result.date, '02-29');
    assert.deepEqual(titles(result.years[0]), ['A']);
  });

  it('is empty with no history', () => {
    assert.deepEqual(getOnThisDay(userId, 'UTC', now), { date: '10-21', years: [] });
  });
});

describe('GET /api/me/on-this-day', () => {
  it('answers the signed-in account', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me/on-this-day?tz=UTC', headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().years, []);
  });

  it('turns guests away', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me/on-this-day', headers: { authorization: `Bearer ${guestToken}` } });
    assert.equal(res.statusCode, 403);
  });
});
