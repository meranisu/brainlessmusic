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

let app: FastifyInstance;
let token: string;
let otherToken: string;
let guestToken: string;
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
  const other = insertUser('bob', 'hash');
  otherToken = signToken({ id: other.id, username: other.username });
  const guest = insertGuest();
  guestToken = signToken({ id: guest.id, username: guest.username });
  rootId = insertLibraryRoot('/library', null).id;
});

function addTrack(title: string, artistName: string, albumTitle: string, duration = 200): number {
  return upsertTrack({
    path: `/library/${title}.mp3`,
    title,
    artistName,
    albumTitle,
    albumYear: null,
    trackNumber: 1,
    duration,
    format: 'MP3',
    fileSize: 1000,
    rootId,
  }).id;
}

function call(method: 'GET' | 'POST' | 'PATCH', url: string, auth = token, payload?: object) {
  return app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${auth}` }, payload });
}

async function play(trackId: number, msPlayed = 30_000, auth = token): Promise<number> {
  const res = await call('POST', `/tracks/${trackId}/scrobble`, auth, { msPlayed });
  assert.equal(res.statusCode, 201);
  return (res.json() as { playId: number }).playId;
}

interface Stats {
  totals: { plays: number; msListened: number; tracks: number; artists: number };
  topTracks: { track: { id: number }; plays: number; msListened: number }[];
  topArtists: { name: string; plays: number }[];
  topAlbums: { title: string; plays: number }[];
  counts: { liked: number; lessOften: number; playlists: number };
  memberSince: string;
}

async function stats(query = '', auth = token): Promise<Stats> {
  const res = await call('GET', `/me/stats${query}`, auth);
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as Stats;
}

describe('listening stats', () => {
  it('ranks songs, artists and albums by plays, only for the signed-in account', async () => {
    const a = addTrack('A', 'Artist One', 'Album One');
    const b = addTrack('B', 'Artist Two', 'Album Two');
    await play(a);
    await play(a);
    await play(b);
    await play(b, 30_000, otherToken);
    await play(b, 30_000, otherToken);
    await play(b, 30_000, otherToken);

    const s = await stats();
    assert.equal(s.totals.plays, 3);
    assert.equal(s.totals.tracks, 2);
    assert.equal(s.totals.artists, 2);
    assert.deepEqual(s.topTracks.map((t) => [t.track.id, t.plays]), [[a, 2], [b, 1]]);
    assert.deepEqual(s.topArtists.map((x) => [x.name, x.plays]), [['Artist One', 2], ['Artist Two', 1]]);
    assert.deepEqual(s.topAlbums.map((x) => [x.title, x.plays]), [['Album One', 2], ['Album Two', 1]]);
    assert.ok(s.memberSince);
  });

  it('counts a play without a final report as the whole song, and a reported one as reported (A62)', async () => {
    const a = addTrack('A', 'X', 'Y', 200);
    await play(a, 100_000);
    assert.equal((await stats()).totals.msListened, 200_000);

    const playId = await play(a, 100_000);
    assert.equal((await call('PATCH', `/me/history/${playId}`, token, { msPlayed: 150_000 })).statusCode, 204);
    assert.equal((await stats()).totals.msListened, 350_000);
  });

  it('caps a final report at the song length and only accepts your own plays', async () => {
    const a = addTrack('A', 'X', 'Y', 200);
    const playId = await play(a);
    await call('PATCH', `/me/history/${playId}`, token, { msPlayed: 9_999_999 });
    assert.equal((await stats()).totals.msListened, 200_000);

    assert.equal((await call('PATCH', `/me/history/${playId}`, otherToken, { msPlayed: 1 })).statusCode, 404);
    assert.equal((await call('PATCH', `/me/history/${playId}`, token, { msPlayed: -1 })).statusCode, 400);
    assert.equal((await call('PATCH', '/me/history/99999', token, { msPlayed: 1 })).statusCode, 404);
  });

  it('limits to the range asked for', async () => {
    const a = addTrack('A', 'X', 'Y');
    const old = await play(a);
    await play(a);
    db.prepare("UPDATE play_history SET played_at = datetime('now', '-60 days') WHERE id = ?").run(old);

    assert.equal((await stats('?range=week')).totals.plays, 1);
    assert.equal((await stats('?range=month')).totals.plays, 1);
    assert.equal((await stats('?range=year')).totals.plays, 2);
    assert.equal((await stats()).totals.plays, 2);
    assert.equal((await call('GET', '/me/stats?range=decade')).statusCode, 400);
  });

  it('counts liked, less often and playlists, and is empty for a new account', async () => {
    const a = addTrack('A', 'X', 'Y');
    await app.inject({ method: 'PUT', url: `/api/tracks/${a}/favorite`, headers: { authorization: `Bearer ${token}` } });
    await app.inject({ method: 'PUT', url: `/api/tracks/${a}/less-often`, headers: { authorization: `Bearer ${token}` } });
    await call('POST', '/playlists', token, { name: 'Mine' });

    assert.deepEqual((await stats()).counts, { liked: 1, lessOften: 1, playlists: 1 });
    const empty = await stats('', otherToken);
    assert.deepEqual(empty.totals, { plays: 0, msListened: 0, tracks: 0, artists: 0 });
    assert.deepEqual(empty.topTracks, []);
  });

  it('gives one song\'s numbers, and lists less-often songs with details', async () => {
    const a = addTrack('A', 'X', 'Y', 100);
    await play(a);
    await play(a);
    const one = (await call('GET', `/me/stats/tracks/${a}`)).json() as { plays: number; msListened: number; firstPlayedAt: string };
    assert.equal(one.plays, 2);
    assert.equal(one.msListened, 200_000);
    assert.ok(one.firstPlayedAt);
    assert.equal((await call('GET', '/me/stats/tracks/99999')).statusCode, 404);

    await app.inject({ method: 'PUT', url: `/api/tracks/${a}/less-often`, headers: { authorization: `Bearer ${token}` } });
    const list = (await call('GET', '/me/less-often')).json() as { total: number; tracks: { id: number; title: string }[] };
    assert.equal(list.total, 1);
    assert.deepEqual(list.tracks.map((t) => t.title), ['A']);
  });

  it('is accounts only', async () => {
    assert.equal((await call('GET', '/me/stats', guestToken)).statusCode, 403);
    assert.equal((await call('GET', '/me/less-often', guestToken)).statusCode, 403);
  });
});
