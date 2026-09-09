import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import { findUserByUsername, insertUser, setAdmin } from '../db/users.js';
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
  ['GET', '/api/tracks'],
  ['GET', '/api/artists'],
  ['GET', '/api/albums'],
  ['GET', '/api/search?q=anything'],
  ['GET', '/api/playlists'],
  ['GET', '/api/me/favorites'],
  ['GET', '/api/me/favorites/ids'],
  ['GET', '/api/auth/me'],
  ['GET', '/api/me/history'],
  ['GET', '/api/stats/top-tracks'],
  ['GET', '/api/users'],
  ['POST', '/api/library/scan'],
  ['POST', '/api/shuffle'],
];

/** Routes that must additionally reject a signed-in non-admin. */
const ADMIN_ROUTES: Array<[method: 'POST' | 'PATCH' | 'DELETE', url: string]> = [
  ['POST', '/api/tracks/upload'],
  ['PATCH', '/api/tracks/1'],
  ['DELETE', '/api/tracks/1'],
  ['PATCH', '/api/users/1'],
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
    const res = await app.inject({ method: 'GET', url: '/api/health' });
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
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${listenerToken}` },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().username, listener);
    assert.equal(res.json().password_hash, undefined, 'never expose the password hash');
  });

  it('rejects malformed authorization headers', async () => {
    for (const authorization of ['', 'Bearer', 'Bearer ', 'Basic abc', 'Token abc', listenerToken]) {
      const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization } });
      assert.equal(res.statusCode, 401, `header ${JSON.stringify(authorization)} should be rejected`);
    }
  });

  it('rejects a garbage or tampered token', async () => {
    const tampered = listenerToken.slice(0, -3) + 'aaa';
    for (const token of ['not.a.jwt', 'aaaa', tampered]) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
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
      url: '/api/auth/me',
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
      url: '/api/auth/me',
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
      url: '/api/tracks',
      headers: { authorization: `Bearer ${mediaToken}` },
    });
    assert.equal(res.statusCode, 401);
  });

  it('refuses a session token in the ?token= media parameter', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/tracks/1/cover?token=${listenerToken}` });
    assert.equal(res.statusCode, 401);
  });

  it('accepts a media token in ?token= on a media route', async () => {
    const mediaToken = signMediaToken({ id: 1, username: listener });
    const res = await app.inject({ method: 'GET', url: `/api/tracks/999/cover?token=${mediaToken}` });
    // 404 means the credential was accepted and the track simply doesn't exist;
    // a 401 would mean the media path is broken.
    assert.notEqual(res.statusCode, 401, 'a media token must be accepted on a media route');
    assert.equal(res.statusCode, 404);
  });

  it('requires some credential on a media route', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tracks/1/cover' });
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
      url: '/api/tracks/999',
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
      url: '/api/tracks/999',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(before.statusCode, 404, 'admin should pass the role check to begin with');

    setAdmin(admin, false);

    const after = await app.inject({
      method: 'DELETE',
      url: '/api/tracks/999',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(after.statusCode, 403, 'the same token must lose admin access immediately');
  });
});

describe('registration is admin-only', () => {
  // Pinned rather than inherited: the shipped default is open registration,
  // and a test that silently follows the default stops testing the gate the
  // day someone changes it.
  before(() => {
    config.allowOpenRegistration = false;
  });
  after(() => {
    config.allowOpenRegistration = true;
  });

  it('lets an admin create a user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: 'newcomer', password: 'a long enough password' },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().username, 'newcomer');
    assert.equal(res.json().password_hash, undefined);
    assert.equal(res.json().isAdmin, false, 'only the bootstrap account is auto-admin');
  });

  it('refuses an anonymous caller once any user exists', async () => {
    // The hole this closes: before, anyone who could reach the server could
    // create an account, which only mattered once it left the LAN.
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'intruder', password: 'a long enough password' },
    });
    assert.equal(res.statusCode, 401);
    assert.equal(findUserByUsername('intruder'), undefined, 'no account should have been created');
  });

  it('refuses a signed-in non-admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { authorization: `Bearer ${listenerToken}` },
      payload: { username: 'sneaky', password: 'a long enough password' },
    });
    assert.equal(res.statusCode, 403);
    assert.equal(findUserByUsername('sneaky'), undefined);
  });

  it('opens registration when there are no users at all, and makes that one an admin', async () => {
    // Otherwise a fresh install deadlocks: registration needs an admin, and
    // an admin can only exist by registering.
    resetDatabase();

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'founder', password: 'a long enough password' },
    });
    assert.equal(first.statusCode, 201);
    assert.equal(first.json().isAdmin, true);
    assert.equal(findUserByUsername('founder')?.is_admin, 1);

    // And the door closes behind them.
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'second', password: 'a long enough password' },
    });
    assert.equal(second.statusCode, 401);
    assert.equal(findUserByUsername('second'), undefined);
  });

  it('rejects a duplicate username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { username: listener, password: 'whatever' },
    });
    assert.equal(res.statusCode, 409);
  });

  it('rejects missing credentials', async () => {
    for (const payload of [{}, { username: 'x' }, { password: 'y' }, { username: '', password: '' }]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { authorization: `Bearer ${adminToken}` },
        payload,
      });
      assert.equal(res.statusCode, 400, `payload ${JSON.stringify(payload)} should be rejected`);
    }
  });
});


describe('open registration', () => {
  // The other posture: anyone who can reach the server may make themselves an
  // account. Fine on a LAN, a real exposure once the server is public — so
  // what it does and does not grant is worth pinning down.
  before(() => {
    config.allowOpenRegistration = true;
  });

  it('lets an anonymous visitor create an account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'walkin', password: 'a long enough password' },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().username, 'walkin');
    assert.equal(res.json().password_hash, undefined, 'never expose hashes');
  });

  it('does not hand out admin to a self-serve account', async () => {
    // The whole point of the setting is more listeners, not more admins. Only
    // the bootstrap account is ever auto-promoted.
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'nobody-special', password: 'a long enough password' },
    });
    assert.equal(findUserByUsername('nobody-special')?.is_admin, 0);
  });

  it('still refuses a duplicate username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: listener, password: 'a long enough password' },
    });
    assert.equal(res.statusCode, 409);
  });

  it('enforces the password floor server-side', async () => {
    // With open registration the browser is not a gate: this endpoint is
    // reachable by anyone, so validation cannot live only in the form.
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'shorty', password: 'sevench' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(findUserByUsername('shorty'), undefined);
  });

  it('rejects usernames that are not plausible names', async () => {
    for (const username of ['x', 'a'.repeat(33), 'has space', 'drop;table', '../../etc']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { username, password: 'a long enough password' },
      });
      assert.equal(res.statusCode, 400, `${JSON.stringify(username)} should be rejected`);
      assert.equal(findUserByUsername(username), undefined);
    }
  });

  it('reports itself as open, but not as a first account', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/registration-status' });
    assert.equal(res.json().open, true);
    assert.equal(res.json().firstAccount, false, 'the signup page must not promise admin here');
  });

  it('grants no admin powers to the account it created', async () => {
    // The gate that matters: an open door to *listening* must not become an
    // open door to deleting the library.
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'curious', password: 'a long enough password' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'curious', password: 'a long enough password' },
    });
    const token = login.json().token;

    for (const [method, url] of [
      ['GET', '/api/users'],
      ['DELETE', '/api/tracks/1'],
      ['POST', '/api/library/scan'],
    ] as const) {
      const res = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });
      assert.equal(res.statusCode, 403, `${method} ${url} must stay admin-only`);
    }
  });
});

describe('user management', () => {
  it('lists users for an admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 200);
    const names = res.json().users.map((u: { username: string }) => u.username).sort();
    assert.deepEqual(names, ['boss', 'listener']);
    assert.equal(res.json().users[0].password_hash, undefined, 'never expose hashes');
  });

  it('reports the registration status without a token', async () => {
    // The signup page has to ask this before anyone can possibly be logged in.
    config.allowOpenRegistration = false;
    const withUsers = await app.inject({ method: 'GET', url: '/api/auth/registration-status' });
    assert.equal(withUsers.statusCode, 200);
    assert.equal(withUsers.json().open, false);
    assert.equal(withUsers.json().firstAccount, false);

    resetDatabase();
    const empty = await app.inject({ method: 'GET', url: '/api/auth/registration-status' });
    assert.equal(empty.json().open, true, 'an empty server always allows the first account');
    assert.equal(empty.json().firstAccount, true);
    config.allowOpenRegistration = true;
  });

  it('promotes and demotes', async () => {
    const listenerId = findUserByUsername(listener)!.id;

    const promoted = await app.inject({
      method: 'PATCH',
      url: `/api/users/${listenerId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isAdmin: true },
    });
    assert.equal(promoted.statusCode, 200);
    assert.equal(promoted.json().isAdmin, true);

    const demoted = await app.inject({
      method: 'PATCH',
      url: `/api/users/${listenerId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isAdmin: false },
    });
    assert.equal(demoted.json().isAdmin, false);
  });

  it('refuses to remove the last admin', async () => {
    // Otherwise an admin can lock the whole installation out of user
    // management from a browser, recoverable only by SSH and the CLI.
    const adminId = findUserByUsername(admin)!.id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${adminId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { isAdmin: false },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(findUserByUsername(admin)?.is_admin, 1, 'the demotion must not have happened');
  });

  it('refuses to delete the last admin, or yourself', async () => {
    const adminId = findUserByUsername(admin)!.id;
    const self = await app.inject({
      method: 'DELETE',
      url: `/api/users/${adminId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(self.statusCode, 409);
    assert.ok(findUserByUsername(admin), 'the account must still exist');
  });

  it('resets a password, and the new one works', async () => {
    const listenerId = findUserByUsername(listener)!.id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${listenerId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { password: 'a brand new password' },
    });
    assert.equal(res.statusCode, 200);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: listener, password: 'a brand new password' },
    });
    assert.equal(login.statusCode, 200, 'the new password should work');

    const old = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: listener, password: 'correct horse battery staple' },
    });
    assert.equal(old.statusCode, 401, 'the old password should not');
  });

  it('rejects a too-short password', async () => {
    const listenerId = findUserByUsername(listener)!.id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/users/${listenerId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { password: 'short' },
    });
    assert.equal(res.statusCode, 400);
  });

  it('deletes an ordinary user', async () => {
    const listenerId = findUserByUsername(listener)!.id;
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${listenerId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.statusCode, 204);
    assert.equal(findUserByUsername(listener), undefined);
  });
});

describe('login', () => {
  it('logs in with the right password and returns a usable token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: listener, password: 'correct horse battery staple' },
    });
    assert.equal(res.statusCode, 200);

    const { token } = res.json();
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().username, listener);
  });

  it('rejects a wrong password and an unknown user identically', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: listener, password: 'wrong' },
    });
    const unknownUser = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'correct horse battery staple' },
    });

    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(unknownUser.statusCode, 401);
    // Identical responses, so the endpoint doesn't reveal which usernames exist.
    assert.deepEqual(wrongPassword.json(), unknownUser.json());
  });
});
