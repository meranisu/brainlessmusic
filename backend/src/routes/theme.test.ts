import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { insertGuest, insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/** `PUT /me/theme` and the `theme` on `/auth/me` (A55): the web theme follows the profile. */

let app: FastifyInstance;
let aliceToken: string;
let bobToken: string;
let guestToken: string;

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

beforeEach(() => {
  resetDatabase();
  const alice = insertUser('alice', 'unused-hash');
  const bob = insertUser('bob', 'unused-hash');
  const guest = insertGuest();
  aliceToken = signToken({ id: alice.id, username: alice.username });
  bobToken = signToken({ id: bob.id, username: bob.username });
  guestToken = signToken({ id: guest.id, username: guest.username });
});

async function themeOf(token: string) {
  const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } });
  return res.json().theme;
}

function putTheme(token: string, payload: unknown) {
  return app.inject({
    method: 'PUT',
    url: '/api/me/theme',
    headers: { authorization: `Bearer ${token}` },
    payload: payload as object,
  });
}

describe('theme on the profile', () => {
  it('is null until chosen, then follows the user who chose it', async () => {
    assert.equal(await themeOf(aliceToken), null);

    assert.equal((await putTheme(aliceToken, { theme: 'red' })).statusCode, 204);
    assert.equal(await themeOf(aliceToken), 'red');
    assert.equal(await themeOf(bobToken), null, 'one user\'s theme must not leak to another');

    await putTheme(aliceToken, { theme: 'void' });
    assert.equal(await themeOf(aliceToken), 'void');
  });

  it('lets a guest keep its own theme', async () => {
    assert.equal((await putTheme(guestToken, { theme: 'pink' })).statusCode, 204);
    assert.equal(await themeOf(guestToken), 'pink');
  });

  it('400s on anything that is not a theme id', async () => {
    for (const payload of [{}, { theme: '' }, { theme: 'Red' }, { theme: 3 }, { theme: 'x'.repeat(33) }, { theme: 'a b' }]) {
      const res = await putTheme(aliceToken, payload);
      assert.equal(res.statusCode, 400, JSON.stringify(payload));
    }
    assert.equal(await themeOf(aliceToken), null);
  });
});
