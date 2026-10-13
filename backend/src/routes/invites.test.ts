import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db/connection.js';
import { claimGuestCode, createGuestCode } from '../db/guestCodes.js';
import { findUserById, insertGuest, insertUser, setAdmin } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { resetAllRateLimiters } from '../services/rateLimit.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/** Account invites and guest upgrade (A107-A112). */

let app: FastifyInstance;
let adminAuth: { authorization: string };
let adminId: number;

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

beforeEach(async () => {
  resetDatabase();
  resetAllRateLimiters();
  const admin = insertUser('boss', await hashPassword('correct horse battery staple'));
  setAdmin('boss', true);
  adminId = admin.id;
  adminAuth = { authorization: `Bearer ${signToken({ id: admin.id, username: admin.username })}` };
});

async function invite(guestUserId?: number): Promise<{ id: number; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/admin/invites',
    headers: adminAuth,
    payload: guestUserId === undefined ? {} : { guestUserId },
  });
  assert.equal(res.statusCode, 201, res.body);
  return res.json();
}

function accept(
  token: string,
  username: string,
  extra: { password?: string; email?: string; passcode?: string } = {},
) {
  const payload = { password: 'a long enough password', email: `${username.toLowerCase()}@example.com`, ...extra, username };
  return app.inject({ method: 'POST', url: `/api/invites/${token}/accept`, payload });
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe('account invites', () => {
  it('a fresh invite makes an account that can log in, case-insensitively', async () => {
    const { token } = await invite();

    const peek = await app.inject({ method: 'GET', url: `/api/invites/${token}` });
    assert.equal(peek.statusCode, 200);
    assert.equal(peek.json().status, 'open');
    assert.equal(peek.json().forGuest, null);

    const res = await accept(token, 'Ali');
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().upgraded, false);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(res.json().token) });
    assert.equal(me.json().username, 'Ali');
    assert.equal(me.json().isGuest, false);
    assert.equal(me.json().isAdmin, false);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'ali', password: 'a long enough password' },
    });
    assert.equal(login.statusCode, 200);
  });

  it('a link works once', async () => {
    const { token } = await invite();
    assert.equal((await accept(token, 'first')).statusCode, 201);
    assert.equal((await accept(token, 'second')).statusCode, 410);
    assert.equal((await app.inject({ method: 'GET', url: `/api/invites/${token}` })).json().status, 'used');
  });

  it('an expired link is refused', async () => {
    const { id, token } = await invite();
    db.prepare("UPDATE account_invites SET expires_at = datetime('now', '-1 minute') WHERE id = ?").run(id);
    assert.equal((await app.inject({ method: 'GET', url: `/api/invites/${token}` })).json().status, 'expired');
    assert.equal((await accept(token, 'late')).statusCode, 410);
  });

  it('a revoked link is refused', async () => {
    const { id, token } = await invite();
    const revoke = await app.inject({ method: 'DELETE', url: `/api/admin/invites/${id}`, headers: adminAuth });
    assert.equal(revoke.statusCode, 204);
    assert.equal((await accept(token, 'nope')).statusCode, 410);
  });

  it('an unknown token is a 404', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/api/invites/not-a-token' })).statusCode, 404);
    assert.equal((await accept('not-a-token', 'someone')).statusCode, 410);
  });

  it('a name differing only by case is taken, and the link stays usable', async () => {
    const { token } = await invite();
    assert.equal((await accept(token, 'BOSS')).statusCode, 409);
    assert.equal((await accept(token, 'other')).statusCode, 201);
  });

  it('refuses names starting with guest-, on accept and on register', async () => {
    const { token } = await invite();
    assert.equal((await accept(token, 'Guest-sneaky')).statusCode, 400);

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: adminAuth,
      payload: { username: 'guest-abc', password: 'a long enough password' },
    });
    assert.equal(register.statusCode, 400);
  });

  it('lists invites for the admin', async () => {
    const guest = insertGuest('Sam');
    await invite();
    await invite(guest.id);
    const res = await app.inject({ method: 'GET', url: '/api/admin/invites', headers: adminAuth });
    const invites = res.json().invites as { status: string; guestName: string | null }[];
    assert.equal(invites.length, 2);
    assert.ok(invites.every((row) => row.status === 'open'));
    assert.ok(invites.some((row) => row.guestName === 'Sam'));
  });
});

describe('guest upgrade', () => {
  it('keeps the same user and their resume point, and revokes their guest codes', async () => {
    const code = createGuestCode(adminId);
    const claimed = claimGuestCode(code.code, 'Sam', 90)!;
    const guest = claimed.user;
    const oldToken = signToken({ id: guest.id, username: guest.username, sessionVersion: guest.session_version });
    db.prepare("INSERT INTO playback_state (user_id, queue, queue_index, position_seconds) VALUES (?, '[]', 0, 12.5)").run(
      guest.id,
    );

    const { token } = await invite(guest.id);
    assert.equal((await app.inject({ method: 'GET', url: `/api/invites/${token}` })).json().forGuest, 'Sam');

    const res = await accept(token, 'sam');
    assert.equal(res.statusCode, 201, res.body);
    assert.equal(res.json().upgraded, true);

    const user = findUserById(guest.id)!;
    assert.equal(user.kind, 'account');
    assert.equal(user.username, 'sam');
    assert.equal(user.display_name, 'Sam', 'a name the guest chose is kept');

    const resume = db.prepare('SELECT position_seconds FROM playback_state WHERE user_id = ?').get(guest.id) as {
      position_seconds: number;
    };
    assert.equal(resume.position_seconds, 12.5);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(res.json().token) });
    assert.equal(me.statusCode, 200);
    assert.equal(me.json().id, guest.id);
    assert.equal(me.json().isGuest, false);

    // The guest's other devices are signed out, and the code no longer signs anyone in.
    const stale = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(oldToken) });
    assert.equal(stale.statusCode, 401);
    assert.equal((db.prepare('SELECT count(*) AS n FROM guest_codes WHERE used_by = ?').get(guest.id) as { n: number }).n, 0);
    const reuse = await app.inject({ method: 'POST', url: '/api/auth/guest', payload: { code: code.code } });
    assert.equal(reuse.statusCode, 401);
  });

  it('drops a random Guest NNNN name', async () => {
    const guest = insertGuest();
    const { token } = await invite(guest.id);
    assert.equal((await accept(token, 'newname')).statusCode, 201);
    assert.equal(findUserById(guest.id)!.display_name, null);
  });

  it('a new upgrade invite for the same guest revokes the old one', async () => {
    const guest = insertGuest('Sam');
    const first = await invite(guest.id);
    const second = await invite(guest.id);
    assert.equal((await accept(first.token, 'sam')).statusCode, 410);
    assert.equal((await accept(second.token, 'sam')).statusCode, 201);
  });

  it('refuses an upgrade invite for an account', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/invites',
      headers: adminAuth,
      payload: { guestUserId: adminId },
    });
    assert.equal(res.statusCode, 404);
  });

  it('deleting the guest kills its open invite', async () => {
    const guest = insertGuest('Sam');
    const { token } = await invite(guest.id);
    await app.inject({ method: 'DELETE', url: `/api/users/${guest.id}`, headers: adminAuth });
    assert.equal((await accept(token, 'sam')).statusCode, 410);
  });
});

describe('signing up with a code (A189-A192)', () => {
  it('a code is 8 typeable characters and works typed loosely', async () => {
    const { token } = await invite();
    assert.match(token, /^[A-HJ-NP-Z2-9]{8}$/);

    const typed = `${token.slice(0, 4).toLowerCase()}-${token.slice(4).toLowerCase()} `;
    assert.equal((await app.inject({ method: 'GET', url: `/api/invites/${encodeURIComponent(typed)}` })).json().status, 'open');
    assert.equal((await accept(encodeURIComponent(typed), 'typed')).statusCode, 201);
  });

  it('a long link token from before codes still works', async () => {
    const hash = createHash('sha256').update('OldLongToken_abcdefghijklmnop', 'utf8').digest('hex');
    db.prepare(
      "INSERT INTO account_invites (token_hash, created_by, expires_at) VALUES (?, ?, datetime('now', '+1 day'))",
    ).run(hash, adminId);
    assert.equal((await accept('OldLongToken_abcdefghijklmnop', 'oldlink')).statusCode, 201);
  });

  it('needs a valid email, and one nobody else has', async () => {
    const { token } = await invite();
    assert.equal((await accept(token, 'noemail', { email: '' })).statusCode, 400);
    assert.equal((await accept(token, 'bademail', { email: 'not an email' })).statusCode, 400);
    assert.equal((await accept(token, 'first', { email: 'Same@Example.com' })).statusCode, 201);

    const second = await invite();
    const clash = await accept(second.token, 'second', { email: 'same@example.com' });
    assert.equal(clash.statusCode, 409);
    assert.match(clash.json().error, /email/);
  });

  it('signs in with the email, by password or the passcode chosen at sign-up', async () => {
    const { token } = await invite();
    assert.equal((await accept(token, 'pat', { passcode: '12a4' })).statusCode, 400);
    const res = await accept(token, 'pat', { email: 'Pat@Example.com', passcode: '2468' });
    assert.equal(res.statusCode, 201, res.body);

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(res.json().token) });
    assert.equal(me.json().email, 'pat@example.com');
    assert.equal(me.json().hasPasscode, true);

    const byPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'PAT@example.com', password: 'a long enough password' },
    });
    assert.equal(byPassword.statusCode, 200, byPassword.body);
    const byPasscode = await app.inject({
      method: 'POST',
      url: '/api/auth/passcode-login',
      payload: { username: 'pat@example.com', passcode: '2468' },
    });
    assert.equal(byPasscode.statusCode, 200, byPasscode.body);
  });

  it('an account without an email can add one, but not someone else\'s', async () => {
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: adminAuth });
    assert.equal(me.json().email, null, 'null is the client\'s cue to ask');

    const { token } = await invite();
    assert.equal((await accept(token, 'taker', { email: 'taken@example.com' })).statusCode, 201);

    const put = (email: string) => app.inject({ method: 'PUT', url: '/api/me/email', headers: adminAuth, payload: { email } });
    assert.equal((await put('nope')).statusCode, 400);
    assert.equal((await put('TAKEN@example.com')).statusCode, 409);
    assert.equal((await put(' Boss@Example.com ')).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/auth/me', headers: adminAuth })).json().email, 'boss@example.com');
  });

  it('changing an email already set takes the current password', async () => {
    const put = (payload: object) => app.inject({ method: 'PUT', url: '/api/me/email', headers: adminAuth, payload });
    assert.equal((await put({ email: 'first@example.com' })).statusCode, 200, 'the first one needs none');
    assert.equal((await put({ email: 'first@example.com' })).statusCode, 200, 'the same one again is no change');
    assert.equal((await put({ email: 'second@example.com' })).statusCode, 403);
    assert.equal((await put({ email: 'second@example.com', password: 'wrong password' })).statusCode, 403);
    const ok = await put({ email: 'second@example.com', password: 'correct horse battery staple' });
    assert.equal(ok.statusCode, 200, ok.body);
  });

  it('login answers with the real username when signed in by email', async () => {
    const { token } = await invite();
    assert.equal((await accept(token, 'Robin', { email: 'robin@example.com' })).statusCode, 201);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'robin@example.com', password: 'a long enough password' },
    });
    assert.equal(res.json().username, 'Robin');
  });

  it('guests can\'t add an email', async () => {
    const guest = insertGuest();
    const headers = bearer(signToken({ id: guest.id, username: guest.username, sessionVersion: guest.session_version }));
    const res = await app.inject({ method: 'PUT', url: '/api/me/email', headers, payload: { email: 'g@example.com' } });
    assert.equal(res.statusCode, 403);
  });
});

