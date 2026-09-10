import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { upsertTrack } from '../db/library.js';
import { insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * The route's job is to refuse nonsense and to keep two listeners apart.
 * Everything about *repairing* a stale queue is tested against the database
 * directly, in `db/playbackState.test.ts`.
 */

let app: FastifyInstance;
let aliceToken: string;
let bobToken: string;
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

  const alice = insertUser('alice', 'hash');
  const bob = insertUser('bob', 'hash');
  aliceToken = signToken({ id: alice.id, username: alice.username });
  bobToken = signToken({ id: bob.id, username: bob.username });

  trackId = upsertTrack({
    path: '/library/a.mp3',
    title: 'A',
    artistName: 'Someone',
    albumTitle: null,
    albumYear: null,
    trackNumber: 1,
    duration: 100,
    format: 'MP3',
    fileSize: 1000,
  }).id;
});

function put(token: string, payload: unknown) {
  return app.inject({
    method: 'PUT',
    url: '/api/me/playback-state',
    headers: { authorization: `Bearer ${token}` },
    payload: payload as Record<string, unknown>,
  });
}

function get(token: string) {
  return app.inject({
    method: 'GET',
    url: '/api/me/playback-state',
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('playback state route', () => {
  it('reports null rather than 404 before anything has been played', async () => {
    const res = await get(aliceToken);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().state, null);
  });

  it('saves and returns a queue', async () => {
    assert.equal((await put(aliceToken, { queue: [trackId], queueIndex: 0, positionSeconds: 12.5 })).statusCode, 204);

    const state = (await get(aliceToken)).json().state;
    assert.equal(state.queue.length, 1);
    assert.equal(state.queue[0].id, trackId);
    assert.equal(state.positionSeconds, 12.5);
  });

  it('never shows one listener another listener\'s queue', async () => {
    await put(aliceToken, { queue: [trackId], queueIndex: 0, positionSeconds: 30 });

    // Bob has saved nothing, and must not inherit Alice's.
    assert.equal((await get(bobToken)).json().state, null);
  });

  it('clears on DELETE', async () => {
    await put(aliceToken, { queue: [trackId], queueIndex: 0, positionSeconds: 30 });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/me/playback-state',
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    assert.equal(res.statusCode, 204);
    assert.equal((await get(aliceToken)).json().state, null);
  });

  it('rejects nonsense rather than coercing it', async () => {
    // A clamped index or a truncated queue would resume someone somewhere they
    // never were, which is worse than refusing: it looks like it worked.
    const bad: Array<[string, unknown]> = [
      ['empty queue', { queue: [], queueIndex: 0, positionSeconds: 0 }],
      ['queue not an array', { queue: 'nope', queueIndex: 0, positionSeconds: 0 }],
      ['non-integer id', { queue: [1.5], queueIndex: 0, positionSeconds: 0 }],
      ['negative id', { queue: [-1], queueIndex: 0, positionSeconds: 0 }],
      ['index past the end', { queue: [trackId], queueIndex: 1, positionSeconds: 0 }],
      ['negative index', { queue: [trackId], queueIndex: -1, positionSeconds: 0 }],
      ['negative position', { queue: [trackId], queueIndex: 0, positionSeconds: -1 }],
      ['position not a number', { queue: [trackId], queueIndex: 0, positionSeconds: '30' }],
      ['missing fields', {}],
    ];

    for (const [name, payload] of bad) {
      const res = await put(aliceToken, payload);
      assert.equal(res.statusCode, 400, `${name} should be rejected, got ${res.statusCode}`);
    }
  });

  it('refuses a queue longer than the cap', async () => {
    const res = await put(aliceToken, {
      queue: Array.from({ length: 5001 }, (_, i) => i + 1),
      queueIndex: 0,
      positionSeconds: 0,
    });
    assert.equal(res.statusCode, 400);
  });

  it('accepts a queue holding ids that no longer exist, and filters them on read', async () => {
    // Saving is not the place to check — a track can vanish after the write
    // just as easily as before it, so the read has to filter regardless.
    assert.equal((await put(aliceToken, { queue: [trackId, 999999], queueIndex: 0, positionSeconds: 5 })).statusCode, 204);

    const state = (await get(aliceToken)).json().state;
    assert.deepEqual(state.queue.map((t: { id: number }) => t.id), [trackId]);
    assert.equal(state.queueRepaired, true);
  });
});
