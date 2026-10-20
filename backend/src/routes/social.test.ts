import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db/connection.js';
import { starTrack } from '../db/favorites.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { recordScrobble } from '../db/plays.js';
import { insertGuest, insertUser } from '../db/users.js';
import { resetAllRateLimiters } from '../services/rateLimit.js';
import { playerCheckedIn, resetStreamMonitor } from '../services/streamMonitor.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/** Friends' now playing and the activity feed (A239-A243). */

let app: FastifyInstance;
let aliceId: number;
let bobId: number;
let guestId: number;
let alice: string;
let bob: string;
let guest: string;
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
  resetAllRateLimiters();
  resetStreamMonitor();
  const tokenFor = (u: { id: number; username: string }) => signToken({ id: u.id, username: u.username });
  const a = insertUser('alice', 'hash');
  const b = insertUser('bob', 'hash');
  const g = insertGuest();
  [aliceId, bobId, guestId] = [a.id, b.id, g.id];
  [alice, bob, guest] = [tokenFor(a), tokenFor(b), tokenFor(g)];
  const rootId = insertLibraryRoot('/library', null).id;
  tracks = [0, 1, 2].map(
    (i) =>
      upsertTrack({
        path: `/library/${i}.mp3`,
        title: `Song ${i}`,
        artistName: `Artist ${i}`,
        albumTitle: null,
        albumYear: null,
        trackNumber: 1,
        duration: 100,
        format: 'MP3',
        fileSize: 1000,
        rootId,
      }).id,
  );
});

function call(method: 'GET' | 'PUT', url: string, auth: string, payload?: object) {
  return app.inject({ method, url: `/api${url}`, headers: { authorization: `Bearer ${auth}` }, payload });
}

function listen(userId: number, trackId: number, userAgent = 'test') {
  playerCheckedIn({ userId, username: 'x', trackId, trackTitle: 't', positionSeconds: 12, userAgent, playing: true });
}

describe('GET /social/now-playing', () => {
  it('shows other accounts playing, not yourself, not guests', async () => {
    listen(aliceId, tracks[0]);
    listen(bobId, tracks[1]);
    listen(guestId, tracks[2]);
    const res = await call('GET', '/social/now-playing', alice);
    assert.equal(res.statusCode, 200);
    const { listening } = res.json();
    assert.equal(listening.length, 1);
    assert.equal(listening[0].person.name, 'bob');
    assert.equal(listening[0].track.id, tracks[1]);
    assert.equal(listening[0].positionSeconds, 12);
    assert.equal(listening[0].person.username, undefined);
  });

  it('shows one line for someone on two devices', async () => {
    listen(bobId, tracks[0], 'phone');
    listen(bobId, tracks[1], 'browser');
    assert.equal((await call('GET', '/social/now-playing', alice)).json().listening.length, 1);
  });

  it('leaves out people who hide their activity and hidden tracks', async () => {
    listen(bobId, tracks[0]);
    assert.equal((await call('PUT', '/me/activity-visibility', bob, { hidden: true })).statusCode, 204);
    assert.equal((await call('GET', '/social/now-playing', alice)).json().listening.length, 0);

    await call('PUT', '/me/activity-visibility', bob, { hidden: false });
    db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(tracks[0]);
    assert.equal((await call('GET', '/social/now-playing', alice)).json().listening.length, 0);
  });

  it('refuses guests', async () => {
    assert.equal((await call('GET', '/social/now-playing', guest)).statusCode, 403);
    assert.equal((await call('GET', '/social/feed', guest)).statusCode, 403);
    assert.equal((await call('PUT', '/me/activity-visibility', guest, { hidden: true })).statusCode, 403);
  });
});

describe('GET /social/feed', () => {
  const recent = (minutesAgo: number) =>
    (db.prepare(`SELECT datetime('now', ?) AS t`).get(`-${minutesAgo} minutes`) as { t: string }).t;

  it('mixes plays, likes and public playlists, newest first', async () => {
    recordScrobble(bobId, tracks[0], 90_000, recent(30));
    starTrack(bobId, tracks[1]);
    db.prepare(`UPDATE favorites SET created_at = ? WHERE user_id = ?`).run(recent(20), bobId);
    const pl = db.prepare(`INSERT INTO playlists (name, owner_id, is_public, public_at) VALUES ('Mix', ?, 1, ?)`).run(bobId, recent(10));
    db.prepare(`INSERT INTO playlists (name, owner_id, is_public) VALUES ('Secret', ?, 0)`).run(bobId);

    const { items } = (await call('GET', '/social/feed', alice)).json();
    assert.deepEqual(
      items.map((i: { kind: string }) => i.kind),
      ['playlist', 'like', 'play'],
    );
    assert.equal(items[0].playlist.id, Number(pl.lastInsertRowid));
    assert.equal(items[1].track.id, tracks[1]);
    assert.equal(items[2].track.id, tracks[0]);
  });

  it('collapses repeats of a song in a day and skips skipped plays', async () => {
    recordScrobble(bobId, tracks[0], 90_000, recent(40));
    recordScrobble(bobId, tracks[0], 90_000, recent(30));
    recordScrobble(bobId, tracks[1], 2_000, recent(20), null, true);
    const { items } = (await call('GET', '/social/feed', alice)).json();
    assert.equal(items.length, 1);
    assert.equal(items[0].at, recent(30));
  });

  it('leaves out yourself, guests, hidden people and hidden tracks', async () => {
    recordScrobble(aliceId, tracks[0], 90_000, recent(5));
    recordScrobble(guestId, tracks[0], 90_000, recent(5));
    recordScrobble(bobId, tracks[2], 90_000, recent(5));
    db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(tracks[2]);
    assert.equal((await call('GET', '/social/feed', alice)).json().items.length, 0);

    db.prepare('UPDATE tracks SET hidden = 0').run();
    await call('PUT', '/me/activity-visibility', bob, { hidden: true });
    assert.equal((await call('GET', '/social/feed', alice)).json().items.length, 0);
  });

  it('pages with nextBefore', async () => {
    tracks.forEach((id, i) => recordScrobble(bobId, id, 90_000, recent(10 * (i + 1))));
    const first = (await call('GET', '/social/feed?limit=2', alice)).json();
    assert.equal(first.items.length, 2);
    assert.ok(first.nextBefore);
    const second = (await call('GET', `/social/feed?limit=2&before=${encodeURIComponent(first.nextBefore)}`, alice)).json();
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0].track.id, tracks[2]);
    assert.equal(second.nextBefore, null);
  });

  it('pages through items that share one second without losing any', async () => {
    const carol = insertUser('carol', 'hash');
    const at = recent(5);
    tracks.forEach((id) => recordScrobble(bobId, id, 90_000, at));
    recordScrobble(carol.id, tracks[0], 90_000, at);
    starTrack(bobId, tracks[0]);
    db.prepare('UPDATE favorites SET created_at = ?').run(at);

    const seen: string[] = [];
    let before: string | null = null;
    do {
      const query: string = before ? `&before=${encodeURIComponent(before)}` : '';
      const page = (await call('GET', `/social/feed?limit=2${query}`, alice)).json();
      for (const i of page.items) seen.push(`${i.kind}:${i.person.id}:${i.track.id}`);
      before = page.nextBefore;
    } while (before);
    assert.equal(seen.length, 5);
    assert.equal(new Set(seen).size, 5);
  });

  it('rejects a bad cursor or limit', async () => {
    assert.equal((await call('GET', '/social/feed?before=yesterday', alice)).statusCode, 400);
    assert.equal((await call('GET', '/social/feed?limit=0', alice)).statusCode, 400);
  });
});

describe('/me', () => {
  it('reports hideActivity', async () => {
    await call('PUT', '/me/activity-visibility', alice, { hidden: true });
    assert.equal((await call('GET', '/auth/me', alice)).json().hideActivity, true);
  });
});
