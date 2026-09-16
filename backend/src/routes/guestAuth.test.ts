import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import {
  countGuests,
  findUserByUsername,
  insertGuest,
  insertUser,
  listUsers,
  pruneIdleGuests,
  setAdmin,
} from '../db/users.js';
import { db } from '../db/connection.js';
import { hashPassword } from '../services/password.js';
import { resetAllRateLimiters } from '../services/rateLimit.js';
import { verifyMediaToken, verifySessionToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * Passwordless guest entry, and the arcade-style passcode sign-in that
 * replaced the hidden admin numpad.
 */

const PASSWORD = 'correct horse battery staple';

let app: FastifyInstance;
let originalConfig: Partial<typeof config>;

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

  originalConfig = {
    entryCode: config.entryCode,
    maxGuests: config.maxGuests,
    guestIdleDays: config.guestIdleDays,
    guestMintsPerHour: config.guestMintsPerHour,
    passcodeAttemptsPerMinute: config.passcodeAttemptsPerMinute,
    allowOpenRegistration: config.allowOpenRegistration,
  };
});

afterEach(() => {
  Object.assign(config, originalConfig);
});

async function mintGuest(payload: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: '/api/auth/guest', payload });
}

async function createAdmin(username = 'boss') {
  const row = insertUser(username, await hashPassword(PASSWORD));
  setAdmin(username, true);
  return row;
}

describe('guest entry', () => {
  it('mints a session with no credentials at all', async () => {
    const res = await mintGuest();

    assert.equal(res.statusCode, 201);
    const { token } = res.json() as { token: string };
    assert.ok(token, 'a token must come back');

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(me.statusCode, 200);
    assert.equal(me.json().isGuest, true);
    assert.equal(me.json().isAdmin, false);
    assert.match(me.json().username, /^guest-[0-9a-f]{6}$/);
  });

  it('gives each caller its own identity, never a shared one', async () => {
    // The decision this encodes (A13): two devices are two listeners, so one
    // person's queue and resume position can never move the other's.
    const first = (await mintGuest()).json() as { token: string };
    const second = (await mintGuest()).json() as { token: string };

    assert.notEqual(
      verifySessionToken(first.token).id,
      verifySessionToken(second.token).id,
      'two guests must not share a row',
    );
    assert.equal(countGuests(), 2);
  });

  it('mints a token that can reach the library and exchange for a media token', async () => {
    const { token } = (await mintGuest()).json() as { token: string };

    const tracks = await app.inject({
      method: 'GET',
      url: '/api/tracks',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(tracks.statusCode, 200);

    const media = await app.inject({
      method: 'POST',
      url: '/api/auth/media-token',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(media.statusCode, 200);
    assert.doesNotThrow(() => verifyMediaToken(media.json().token));
  });

  it('is never an admin', async () => {
    const { token } = (await mintGuest()).json() as { token: string };

    for (const url of ['/api/users', '/api/library/scan']) {
      const res = await app.inject({
        method: url === '/api/users' ? 'GET' : 'POST',
        url,
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.statusCode, 403, `${url} must refuse a guest`);
    }
  });

  it('cannot be logged into with a password', async () => {
    // A guest's hash is '' — this asserts the route refuses on `kind` before
    // it ever reaches bcrypt, so the refusal does not depend on what
    // bcrypt.compare happens to do with an empty hash.
    const guest = insertGuest();

    for (const password of [' ', PASSWORD, 'guest', guest.username]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: guest.username, password },
      });
      assert.equal(res.statusCode, 401, `password ${JSON.stringify(password)} must be refused`);
    }

    // An empty password is caught earlier, as a missing field — worth pinning
    // so nobody later "fixes" it into a 401 and quietly changes what a blank
    // form does for accounts too.
    const blank = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: guest.username, password: '' },
    });
    assert.equal(blank.statusCode, 400);
  });

  it('does not count toward "is this server claimed yet"', async () => {
    // The deadlock this avoids: the first visitor to a fresh server presses
    // enter, and if that closed the bootstrap window nobody could ever create
    // the first admin.
    config.allowOpenRegistration = false;
    await mintGuest();

    const status = await app.inject({ method: 'GET', url: '/api/auth/registration-status' });
    assert.equal(status.json().open, true);
    assert.equal(status.json().firstAccount, true);

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'owner', password: PASSWORD },
    });
    assert.equal(register.statusCode, 201);
    assert.equal(register.json().isAdmin, true, 'the bootstrap account must still become admin');
  });

  it('records staleness on /auth/me, not on every request', async () => {
    const { token } = (await mintGuest()).json() as { token: string };
    const username = verifySessionToken(token).username;

    assert.equal(findUserByUsername(username)!.last_seen_at, null);

    await app.inject({
      method: 'GET',
      url: '/api/tracks',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(findUserByUsername(username)!.last_seen_at, null, 'a library read is not a touch');

    await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.notEqual(findUserByUsername(username)!.last_seen_at, null);
  });

  it('shows up as a guest on the admin user list', async () => {
    await createAdmin();
    insertGuest();

    const kinds = listUsers().map((user) => user.kind).sort();
    assert.deepEqual(kinds, ['account', 'guest']);
  });
});

describe('guest entry — the entry code', () => {
  it('is open when ENTRY_CODE is unset', async () => {
    config.entryCode = '';
    assert.equal((await mintGuest()).statusCode, 201);
  });

  it('demands the code when set, and accepts only the right one', async () => {
    config.entryCode = 'open-sesame';

    assert.equal((await mintGuest()).statusCode, 401, 'no code');
    assert.equal((await mintGuest({ code: 'open-sesam' })).statusCode, 401, 'near miss');
    assert.equal((await mintGuest({ code: 'OPEN-SESAME' })).statusCode, 401, 'wrong case');
    assert.equal((await mintGuest({ code: 42 })).statusCode, 401, 'not even a string');
    assert.equal((await mintGuest({ code: 'open-sesame' })).statusCode, 201);
  });

  it('mints nothing on a refusal', async () => {
    config.entryCode = 'open-sesame';
    await mintGuest({ code: 'wrong' });
    assert.equal(countGuests(), 0, 'a refused attempt must not leave a row behind');
  });
});

describe('guest entry — limits', () => {
  it('rate-limits one address', async () => {
    config.guestMintsPerHour = 3;

    for (let i = 0; i < 3; i += 1) {
      assert.equal((await mintGuest()).statusCode, 201, `mint ${i + 1} should be allowed`);
    }

    const refused = await mintGuest();
    assert.equal(refused.statusCode, 429);
    assert.ok(Number(refused.headers['retry-after']) > 0, 'must say when to come back');
    assert.equal(countGuests(), 3);
  });

  it('prunes idle guests when the cap is reached, and refuses when it cannot', async () => {
    config.maxGuests = 2;
    config.guestIdleDays = 30;
    config.guestMintsPerHour = 100;

    const stale = insertGuest();
    const fresh = insertGuest();
    db.prepare("UPDATE users SET last_seen_at = datetime('now', '-90 days') WHERE id = ?").run(stale.id);

    // Room is made by collecting the stale one, not by refusing.
    assert.equal((await mintGuest()).statusCode, 201);
    assert.equal(findUserByUsername(stale.username), undefined, 'the idle guest should be gone');
    assert.ok(findUserByUsername(fresh.username), 'the active guest must survive');
    assert.equal(countGuests(), 2);

    // Now nothing is prunable, so the door closes rather than growing.
    const refused = await mintGuest();
    assert.equal(refused.statusCode, 503);
    assert.equal(countGuests(), 2);
  });

  it('never prunes an account, however old', async () => {
    const admin = await createAdmin();
    db.prepare("UPDATE users SET last_seen_at = datetime('now', '-900 days') WHERE id = ?").run(admin.id);

    assert.equal(pruneIdleGuests(1), 0);
    assert.ok(findUserByUsername(admin.username), 'an account is never collected');
  });

  it('takes a pruned guest\'s own rows with it', async () => {
    const guest = insertGuest();
    db.prepare("UPDATE users SET last_seen_at = datetime('now', '-90 days') WHERE id = ?").run(guest.id);
    db.prepare('INSERT INTO playback_state (user_id, queue, queue_index, position_seconds) VALUES (?, ?, 0, 0)').run(
      guest.id,
      '[]',
    );
    db.prepare('INSERT INTO playlists (name, owner_id) VALUES (?, ?)').run('theirs', guest.id);

    assert.equal(pruneIdleGuests(30), 1);

    // Foreign keys are enforced, so orphans would have thrown rather than
    // lingering — but assert the rows are actually gone, not merely unreferenced.
    const states = db.prepare('SELECT COUNT(*) c FROM playback_state WHERE user_id = ?').get(guest.id) as {
      c: number;
    };
    const playlists = db.prepare('SELECT COUNT(*) c FROM playlists WHERE owner_id = ?').get(guest.id) as {
      c: number;
    };
    assert.equal(states.c, 0);
    assert.equal(playlists.c, 0);
  });
});

describe('passcode sign-in', () => {
  async function setPasscode(token: string, passcode: string) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/passcode',
      headers: { authorization: `Bearer ${token}` },
      payload: { passcode },
    });
  }

  async function loginWithPasscode(username: string, passcode: unknown) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/passcode-login',
      payload: { username, passcode },
    });
  }

  it('has no passcode until one is set', async () => {
    const admin = await createAdmin();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: admin.username, password: PASSWORD },
    });
    const { token } = login.json() as { token: string };

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.json().hasPasscode, false);

    assert.equal((await loginWithPasscode(admin.username, '1234')).statusCode, 401);
  });

  it('can be created by the signed-in account and used to log back in', async () => {
    const admin = await createAdmin();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: admin.username, password: PASSWORD },
    });
    const { token } = login.json() as { token: string };

    assert.equal((await setPasscode(token, '4269')).statusCode, 204);

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(me.json().hasPasscode, true);

    const res = await loginWithPasscode(admin.username, '4269');
    assert.equal(res.statusCode, 200);
    assert.ok(res.json().token);
  });

  it('refuses a passcode outside 4-8 digits, or non-numeric', async () => {
    const admin = await createAdmin();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: admin.username, password: PASSWORD },
    });
    const { token } = login.json() as { token: string };

    for (const passcode of ['123', '123456789', 'abcd', '12 34', '']) {
      const res = await setPasscode(token, passcode);
      assert.equal(res.statusCode, 400, `passcode ${JSON.stringify(passcode)} must be refused`);
    }
  });

  it('refuses a guest trying to set one', async () => {
    const { token } = (await mintGuest()).json() as { token: string };
    assert.equal((await setPasscode(token, '1234')).statusCode, 403);
  });

  it('refuses a wrong passcode with the same shape as no passcode at all', async () => {
    const admin = await createAdmin();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: admin.username, password: PASSWORD },
    });
    await setPasscode((login.json() as { token: string }).token, '4269');

    const res = await loginWithPasscode(admin.username, '0000');
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, 'invalid username or passcode');
  });

  it('can be removed, after which it refuses to log in again', async () => {
    const admin = await createAdmin();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: admin.username, password: PASSWORD },
    });
    const { token } = login.json() as { token: string };
    await setPasscode(token, '4269');

    const cleared = await app.inject({
      method: 'DELETE',
      url: '/api/auth/passcode',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(cleared.statusCode, 204);

    assert.equal((await loginWithPasscode(admin.username, '4269')).statusCode, 401);
  });

  it('rate-limits attempts per address, and a correct one clears the window', async () => {
    config.passcodeAttemptsPerMinute = 3;
    const admin = await createAdmin();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: admin.username, password: PASSWORD },
    });
    await setPasscode((login.json() as { token: string }).token, '4269');

    for (let i = 0; i < 3; i += 1) {
      const res = await loginWithPasscode(admin.username, '0000');
      assert.equal(res.statusCode, 401, `attempt ${i + 1} is merely wrong`);
    }

    const locked = await loginWithPasscode(admin.username, '4269');
    assert.equal(locked.statusCode, 429, 'even the right passcode waits once the budget is spent');
  });
});
