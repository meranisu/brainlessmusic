import assert from 'node:assert/strict';
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

function accept(token: string, username: string, password = 'a long enough password') {
  return app.inject({ method: 'POST', url: `/api/invites/${token}/accept`, payload: { username, password } });
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
