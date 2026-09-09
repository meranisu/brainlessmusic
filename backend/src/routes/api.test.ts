import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { insertUser, setAdmin } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { signMediaToken, signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * Smoke tests over the real Fastify instance via `.inject()` — no socket, no
 * port. These cover the two things that would be worst to get wrong quietly:
 * a protected route that isn't actually protected, and an admin route a
 * non-admin can reach.
 */

let app: FastifyInstance;
let listener: string;
let listenerToken: string;
let admin: string;
let adminToken: string;

/** Every route that must reject an anonymous caller. */
const PROTECTED_ROUTES: Array<[method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string]> = [
  ['GET', '/tracks'],
  ['GET', '/artists'],
  ['GET', '/albums'],
  ['GET', '/search?q=anything'],
  ['GET', '/playlists'],
  ['GET', '/me/favorites'],
  ['GET', '/me/favorites/ids'],
  ['GET', '/auth/me'],
  ['GET', '/me/history'],
  ['GET', '/stats/top-tracks'],
  ['POST', '/library/scan'],
  ['POST', '/shuffle'],
];

/** Routes that must additionally reject a signed-in non-admin. */
const ADMIN_ROUTES: Array<[method: 'POST' | 'PATCH' | 'DELETE', url: string]> = [
  ['POST', '/tracks/upload'],
  ['PATCH', '/tracks/1'],
  ['DELETE', '/tracks/1'],
];

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

beforeEach(async () => {
  resetDatabase();

  const hash = await hashPassword('correct horse battery staple');
  const listenerRow = insertUser('listener', hash);
  const adminRow = insertUser('boss', hash);
  setAdmin('boss', true);

  listener = listenerRow.username;
  admin = adminRow.username;
  listenerToken = signToken({ id: listenerRow.id, username: listenerRow.username });
  adminToken = signToken({ id: adminRow.id, username: adminRow.username });
});

describe('open routes', () => {
  it('serves /health without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'ok');
  });
});

describe('authentication', () => {
  it('rejects every protected route without a token', async () => {
    for (const [method, url] of PROTECTED_ROUTES) {
      const res = await app.inject({ method, url });
      assert.equal(res.statusCode, 401, `${method} ${url} should require auth, got ${res.statusCode}`);
    }
  });

  it('and those routes all actually exist', async () => {
    // Without this, a typo in PROTECTED_ROUTES would make the test above pass
    // for the wrong reason — a missing route is not a protected one. (It
    // already caught one: /history is really /me/history.)
    for (const [method, url] of PROTECTED_ROUTES) {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${listenerToken}` },
        payload: method === 'POST' ? {} : undefined,
      });
      assert.notEqual(res.statusCode, 404, `${method} ${url} does not exist`);
    }
  });

  it('accepts a valid session token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().username, listener);
    assert.equal(res.json().password_hash, undefined, 'never expose the password hash');
  });

  it('rejects malformed authorization headers', async () => {
    for (const authorization of ['', 'Bearer', 'Bearer ', 'Basic abc', 'Token abc', listenerToken]) {
      const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization } });
      assert.equal(res.statusCode, 401, `header ${JSON.stringify(authorization)} should be rejected`);
    }
  });

  it('rejects a garbage or tampered token', async () => {
    const tampered = listenerToken.slice(0, -3) + 'aaa';
    for (const token of ['not.a.jwt', 'aaaa', tampered]) {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.statusCode, 401, `token ${token} should be rejected`);
    }
  });

  it('rejects a token signed with a different secret', async () => {
    // The whole point of step 10's boot check: a forged token must not verify.
    const forged = jwt.sign({ sub: 1, username: 'listener' }, 'some-other-secret', { expiresIn: '1h' });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${forged}` },
    });
    assert.equal(res.statusCode, 401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign(
      { sub: 1, username: 'listener' },
      process.env.JWT_SECRET ?? 'change-me',
      { expiresIn: '-1s' },
    );
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${expired}` },
    });
    assert.equal(res.statusCode, 401);
  });
});

describe('token scope separation', () => {
  it('refuses a media token used as a bearer credential', async () => {
    // Media tokens travel in URLs, so they end up in logs and history. If one
    // could be replayed as a session credential, the short TTL would be the
    // only thing between a leaked URL and full API access.
    const mediaToken = signMediaToken({ id: 1, username: listener });
    const res = await app.inject({
      method: 'GET',
      url: '/tracks',
      headers: { authorization: `Bearer ${mediaToken}` },
    });
    assert.equal(res.statusCode, 401);
  });

  it('refuses a session token in the ?token= media parameter', async () => {
    const res = await app.inject({ method: 'GET', url: `/tracks/1/cover?token=${listenerToken}` });
    assert.equal(res.statusCode, 401);
  });

  it('accepts a media token in ?token= on a media route', async () => {
    const mediaToken = signMediaToken({ id: 1, username: listener });
    const res = await app.inject({ method: 'GET', url: `/tracks/999/cover?token=${mediaToken}` });
    // 404 means the credential was accepted and the track simply doesn't exist;
    // a 401 would mean the media path is broken.
    assert.notEqual(res.statusCode, 401, 'a media token must be accepted on a media route');
    assert.equal(res.statusCode, 404);
  });

  it('requires some credential on a media route', async () => {
    const res = await app.inject({ method: 'GET', url: '/tracks/1/cover' });
    assert.equal(res.statusCode, 401);
  });
});

describe('admin gating', () => {
  it('refuses admin routes to a signed-in non-admin', async () => {
    for (const [method, url] of ADMIN_ROUTES) {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${listenerToken}` },
        payload: method === 'PATCH' ? { title: 'nope' } : undefined,
      });
      assert.equal(res.statusCode, 403, `${method} ${url} should be admin-only, got ${res.statusCode}`);
    }
  });

  it('refuses admin routes to an anonymous caller with 401, not 403', async () => {
    // Order matters: `authenticate` runs before `requireAdmin`, so a caller
    // with no token must be told to authenticate rather than that they lack a
    // role they could never have been checked for.
    for (const [method, url] of ADMIN_ROUTES) {
      const res = await app.inject({ method, url, payload: method === 'PATCH' ? {} : undefined });
      assert.equal(res.statusCode, 401, `${method} ${url} should be 401 when anonymous`);
    }
  });

  it('lets an admin past the role check', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/tracks/999',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // 404 because the track doesn't exist — the point is that it isn't 403.
    assert.equal(res.statusCode, 404);
  });

  it('honours a role revoked mid-session, without waiting for the token to expire', async () => {
    // requireAdmin re-reads is_admin from the database rather than trusting
    // the JWT payload. This is the test that proves it.
    const before = await app.inject({
      method: 'DELETE',
      url: '/tracks/999',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(before.statusCode, 404, 'admin should pass the role check to begin with');

    setAdmin(admin, false);

    const after = await app.inject({
      method: 'DELETE',
      url: '/tracks/999',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(after.statusCode, 403, 'the same token must lose admin access immediately');
  });
});

describe('register and login', () => {
  it('registers a new user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'newcomer', password: 'a long enough password' },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().username, 'newcomer');
    assert.equal(res.json().password_hash, undefined);
  });

  it('rejects a duplicate username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: listener, password: 'whatever' },
    });
    assert.equal(res.statusCode, 409);
  });

  it('rejects missing credentials', async () => {
    for (const payload of [{}, { username: 'x' }, { password: 'y' }, { username: '', password: '' }]) {
      const res = await app.inject({ method: 'POST', url: '/auth/register', payload });
      assert.equal(res.statusCode, 400, `payload ${JSON.stringify(payload)} should be rejected`);
    }
  });

  it('logs in with the right password and returns a usable token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: listener, password: 'correct horse battery staple' },
    });
    assert.equal(res.statusCode, 200);

    const { token } = res.json();
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().username, listener);
  });

  it('rejects a wrong password and an unknown user identically', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: listener, password: 'wrong' },
    });
    const unknownUser = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'nobody', password: 'correct horse battery staple' },
    });

    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(unknownUser.statusCode, 401);
    // Identical responses, so the endpoint doesn't reveal which usernames exist.
    assert.deepEqual(wrongPassword.json(), unknownUser.json());
  });
});
