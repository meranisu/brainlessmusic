import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db/connection.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { insertGuest, insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { getListeningPatterns } from '../db/listeningStats.js';
import { resetDatabase } from '../testing/harness.js';

let app: FastifyInstance;
let token: string;
let guestToken: string;
let rootId: number;
let userId: number;

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
  const guest = insertGuest();
  guestToken = signToken({ id: guest.id, username: guest.username });
  rootId = insertLibraryRoot('/library', null).id;
});

function addTrack(title: string, artistName: string, albumTitle: string, duration = 200, trackNumber = 1): number {
  return upsertTrack({
    path: `/library/${title}.mp3`,
    title,
    artistName,
    albumTitle,
    albumYear: null,
    trackNumber,
    duration,
    format: 'MP3',
    fileSize: 1000,
    rootId,
  }).id;
}

function call(method: 'GET' | 'POST', url: string, auth = token, payload?: object) {
  return app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${auth}` }, payload });
}

async function play(trackId: number, msPlayed = 30_000, auth = token): Promise<number> {
  const res = await call('POST', `/tracks/${trackId}/scrobble`, auth, { msPlayed });
  assert.equal(res.statusCode, 201);
  return (res.json() as { playId: number }).playId;
}

const DAY = 86_400_000;
const utcDay = (offsetDays: number) => new Date(Date.now() - offsetDays * DAY).toISOString().slice(0, 10);

/** Plays [trackId] and moves the play to [at] (SQLite UTC text). */
async function playAt(trackId: number, at: string, msPlayed = 30_000): Promise<void> {
  const id = await play(trackId, msPlayed);
  db.prepare('UPDATE play_history SET played_at = ? WHERE id = ?').run(at, id);
}

function markSkipped(): void {
  db.prepare('UPDATE play_history SET skipped = 1 WHERE id = (SELECT MAX(id) FROM play_history)').run();
}

interface Patterns {
  tz: string;
  bucket: 'day' | 'week';
  byHour: { plays: number; msListened: number }[];
  byWeekday: { plays: number; msListened: number }[];
  trend: { date: string; plays: number; msListened: number; skips: number }[];
  streak: { current: number; longest: number; longestEndedOn: string | null };
  busiest: { hour: number | null; weekday: number | null; day: { date: string; plays: number } | null };
}

async function patterns(query: string, auth = token): Promise<Patterns> {
  const res = await call('GET', `/me/stats/patterns${query}`, auth);
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as Patterns;
}

describe('listening patterns', () => {
  it('buckets by hour in the zone asked for', async () => {
    const a = addTrack('A', 'Artist', 'Album');
    await playAt(a, `${utcDay(1)} 23:30:00`);

    const utc = await patterns('?range=week');
    assert.equal(utc.tz, 'UTC');
    assert.equal(utc.byHour[23].plays, 1);

    const kl = await patterns('?range=week&tz=Asia/Kuala_Lumpur');
    assert.equal(kl.tz, 'Asia/Kuala_Lumpur');
    assert.equal(kl.byHour[7].plays, 1);
    assert.equal(kl.busiest.hour, 7);
    assert.equal(kl.busiest.day?.date, utcDay(0));
    assert.equal(kl.byWeekday[(new Date(`${utcDay(0)}T00:00:00Z`).getUTCDay() + 6) % 7].plays, 1);
  });

  it('follows daylight saving changes', () => {
    const a = addTrack('A', 'Artist', 'Album');
    const insert = db.prepare("INSERT INTO play_history (user_id, track_id, played_at, ms_played) VALUES (?, ?, ?, 30000)");
    // Clocks in London go forward at 01:00 UTC on 2026-03-29.
    insert.run(userId, a, '2026-03-29 00:30:00');
    insert.run(userId, a, '2026-03-29 01:30:00');
    const p = getListeningPatterns(userId, 'all', 'Europe/London');
    assert.equal(p.byHour[0].plays, 1);
    assert.equal(p.byHour[2].plays, 1);
    assert.equal(p.byHour[1].plays, 0);
  });

  it('counts skips toward time and the trend, not plays', async () => {
    const a = addTrack('A', 'Artist', 'Album', 200);
    await playAt(a, `${utcDay(0)} 00:00:01`);
    await playAt(a, `${utcDay(0)} 00:00:02`, 5_000);
    markSkipped();
    const p = await patterns('?range=week');
    const today = p.trend.at(-1)!;
    assert.equal(today.date, utcDay(0));
    assert.equal(today.plays, 1);
    assert.equal(today.skips, 1);
    assert.equal(p.byHour[0].plays, 1);
    assert.ok(p.byHour[0].msListened > 0);
  });

  it('fills days with no plays', async () => {
    const p = await patterns('?range=week');
    assert.equal(p.bucket, 'day');
    assert.equal(p.trend.length, 8);
    assert.equal(p.trend.at(-1)!.date, utcDay(0));
    assert.ok(p.trend.every((x) => x.plays === 0));
    assert.deepEqual(p.busiest, { hour: null, weekday: null, day: null });
    assert.deepEqual(p.streak, { current: 0, longest: 0, longestEndedOn: null });
  });

  it('uses weekly bars for all time, Monday first', async () => {
    const a = addTrack('A', 'Artist', 'Album');
    await playAt(a, `${utcDay(20)} 00:00:01`);
    const p = await patterns('?range=all');
    assert.equal(p.bucket, 'week');
    assert.ok(p.trend.length >= 3 && p.trend.length <= 5);
    for (const w of p.trend) assert.equal(new Date(`${w.date}T00:00:00Z`).getUTCDay(), 1);
    assert.equal(p.trend.reduce((n, w) => n + w.plays, 0), 1);
  });

  it('counts streaks over all time, whatever the range', async () => {
    const a = addTrack('A', 'Artist', 'Album');
    for (const d of [0, 1, 6, 7, 8, 9, 10]) await playAt(a, `${utcDay(d)} 00:00:01`);
    // A skip alone does not keep a day in the streak.
    await playAt(a, `${utcDay(2)} 00:00:01`);
    markSkipped();
    const p = await patterns('?range=week');
    assert.deepEqual(p.streak, { current: 2, longest: 5, longestEndedOn: utcDay(6) });
  });

  it('keeps yesterday counting as a live streak', async () => {
    const a = addTrack('A', 'Artist', 'Album');
    for (const d of [1, 2, 3]) await playAt(a, `${utcDay(d)} 00:00:01`);
    const p = await patterns('?range=month');
    assert.equal(p.streak.current, 3);
  });

  it('falls back to UTC for an unknown zone and rejects a bad range', async () => {
    assert.equal((await patterns('?tz=Not/AZone')).tz, 'UTC');
    assert.equal((await call('GET', '/me/stats/patterns?range=decade')).statusCode, 400);
  });

  it('is accounts only', async () => {
    assert.equal((await call('GET', '/me/stats/patterns', guestToken)).statusCode, 403);
  });

  it('adds top genres to /me/stats', async () => {
    const res = await call('GET', '/me/stats?range=all');
    assert.equal(res.statusCode, 200);
    assert.deepEqual((res.json() as { topGenres: unknown[] }).topGenres, []);
  });
});
