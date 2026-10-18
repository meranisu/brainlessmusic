import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import { db } from '../db/connection.js';
import { insertUser, setAdmin } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { resetAllRateLimiters } from '../services/rateLimit.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/** Guest accounts (A67-A70): a reusable code per guest, names, the sign-in log, revoke, and "Request a code". */

interface Signin {
  at: string;
  platform: string | null;
  userAgent: string | null;
  ip: string | null;
}

interface Listing {
  id: number;
  code: string;
  status: 'active' | 'used' | 'expired';
  usedBy: string | null;
  usedByName: string | null;
  signins: Signin[];
}

interface Panel {
  codes: Listing[];
  requests: { id: number; name: string | null; platform: string | null }[];
}

let app: FastifyInstance;
let adminAuth: { authorization: string };
let originalEntryCode: string;
let originalRequestsPerHour: number;
let originalMaxPending: number;
let originalPolls: number;

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
  originalEntryCode = config.entryCode;
  originalRequestsPerHour = config.guestRequestsPerHour;
  originalMaxPending = config.maxPendingGuestRequests;
  originalPolls = config.guestRequestPollsPerMinute;
  config.entryCode = '';

  const admin = insertUser('boss', await hashPassword('correct horse battery staple'));
  setAdmin('boss', true);
  adminAuth = { authorization: `Bearer ${signToken({ id: admin.id, username: admin.username })}` };
});

afterEach(() => {
  config.entryCode = originalEntryCode;
  config.guestRequestsPerHour = originalRequestsPerHour;
  config.maxPendingGuestRequests = originalMaxPending;
  config.guestRequestPollsPerMinute = originalPolls;
});

async function newCode(): Promise<Listing> {
  const res = await app.inject({ method: 'POST', url: '/api/guest-codes', headers: adminAuth });
  assert.equal(res.statusCode, 201);
  return res.json() as Listing;
}

async function panel(): Promise<Panel> {
  const res = await app.inject({ method: 'GET', url: '/api/guest-codes', headers: adminAuth });
  assert.equal(res.statusCode, 200);
  return res.json() as Panel;
}

function enter(body: Record<string, unknown>, userAgent = 'test-agent') {
  return app.inject({ method: 'POST', url: '/api/auth/guest', payload: body, headers: { 'user-agent': userAgent } });
}

function me(token: string) {
  return app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } });
}

function request(body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/auth/guest/requests', payload: body });
}

function collect(id: number, secret: string) {
  return app.inject({ method: 'POST', url: `/api/auth/guest/requests/${id}/collect`, payload: { secret } });
}

describe('guest codes as accounts', () => {
  it('signs two devices in as one named guest, and logs both sign-ins', async () => {
    const { code } = await newCode();

    const web = await enter({ code, name: '  Ali  ', platform: 'web' }, 'Firefox');
    assert.equal(web.statusCode, 201);
    // The name on a second device is ignored: the code says who you are (A68).
    const phone = await enter({ code, name: 'Someone else', platform: 'android' }, 'okhttp');
    assert.equal(phone.statusCode, 200);

    const a = (await me(web.json().token)).json();
    const b = (await me(phone.json().token)).json();
    assert.equal(a.id, b.id);
    assert.equal(a.displayName, 'Ali');
    assert.equal(a.isGuest, true);

    const [listing] = (await panel()).codes;
    assert.equal(listing.usedByName, 'Ali');
    assert.deepEqual(
      listing.signins.map((s) => [s.platform, s.userAgent]),
      [
        ['android', 'okhttp'],
        ['web', 'Firefox'],
      ],
    );
  });

  it('names an unnamed guest Guest NNNN, on a code or through the open door', async () => {
    const { code } = await newCode();
    const viaCode = (await me((await enter({ code })).json().token)).json();
    const viaDoor = (await me((await enter({})).json().token)).json();
    assert.match(viaCode.displayName, /^Guest \d{4}$/);
    assert.match(viaDoor.displayName, /^Guest \d{4}$/);
  });

  it('refuses a wrong code even with the door open', async () => {
    assert.equal((await enter({ code: 'ZZZZZZZZ' })).statusCode, 401);
    assert.equal((await enter({})).statusCode, 201);
  });

  it('refuses a name that is too long or not text', async () => {
    assert.equal((await enter({ name: 'x'.repeat(33) })).statusCode, 400);
    assert.equal((await enter({ name: 42 })).statusCode, 400);
    assert.equal((await enter({ name: 'x'.repeat(32) })).statusCode, 201);
  });

  it('stops a code whose guest has gone unseen for GUEST_IDLE_DAYS (A70)', async () => {
    const { code } = await newCode();
    assert.equal((await enter({ code })).statusCode, 201);

    db.prepare("UPDATE users SET last_seen_at = datetime('now', ?) WHERE kind = 'guest'").run(
      `-${config.guestIdleDays + 1} days`,
    );
    assert.equal((await enter({ code })).statusCode, 401);
  });

  it('revoking a used code deletes the guest and signs every device out', async () => {
    const { id, code } = await newCode();
    const one = (await enter({ code })).json().token;
    const two = (await enter({ code })).json().token;

    const res = await app.inject({ method: 'DELETE', url: `/api/guest-codes/${id}`, headers: adminAuth });
    assert.equal(res.statusCode, 204);

    assert.equal((await me(one)).statusCode, 401);
    assert.equal((await me(two)).statusCode, 401);
    assert.equal((await enter({ code })).statusCode, 401);
    const guests = db.prepare("SELECT COUNT(*) AS n FROM users WHERE kind = 'guest'").get() as { n: number };
    assert.equal(guests.n, 0);
  });

  it('joins an existing guest even when the server is full', async () => {
    const { code } = await newCode();
    await enter({ code });
    const originalMax = config.maxGuests;
    config.maxGuests = 1;
    try {
      assert.equal((await enter({ code })).statusCode, 200);
      assert.equal((await enter({})).statusCode, 503);
    } finally {
      config.maxGuests = originalMax;
    }
  });
});

describe('PUT /me/name', () => {
  it('renames a guest, and an empty name gives a guest a fresh Guest NNNN', async () => {
    const token = (await enter({ name: 'Ali' })).json().token;
    const headers = { authorization: `Bearer ${token}` };

    let res = await app.inject({ method: 'PUT', url: '/api/me/name', headers, payload: { name: 'Ali B' } });
    assert.equal(res.statusCode, 200);
    assert.equal((await me(token)).json().displayName, 'Ali B');

    res = await app.inject({ method: 'PUT', url: '/api/me/name', headers, payload: { name: '' } });
    assert.match(res.json().displayName, /^Guest \d{4}$/);

    res = await app.inject({ method: 'PUT', url: '/api/me/name', headers, payload: {} });
    assert.equal(res.statusCode, 400);
  });

  it('an account falls back to its username when cleared', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/me/name', headers: adminAuth, payload: { name: '' } });
    assert.equal(res.json().displayName, 'boss');
  });
});

describe('requesting a code (A67)', () => {
  it('approve signs the waiting device in once, with the code to use elsewhere', async () => {
    const created = await request({ name: 'Mei', platform: 'android' });
    assert.equal(created.statusCode, 201);
    const { id, secret } = created.json() as { id: number; secret: string };

    assert.deepEqual((await collect(id, secret)).json(), { status: 'pending' });
    assert.deepEqual(
      (await panel()).requests.map((r) => [r.name, r.platform]),
      [['Mei', 'android']],
    );

    const approved = await app.inject({
      method: 'POST',
      url: `/api/guest-codes/requests/${id}/approve`,
      headers: adminAuth,
    });
    assert.equal(approved.statusCode, 200);
    assert.equal((approved.json() as Panel).requests.length, 0);

    const handed = (await collect(id, secret)).json() as { status: string; token: string; code: string };
    assert.equal(handed.status, 'approved');
    assert.equal((await me(handed.token)).json().displayName, 'Mei');

    // A lost answer can be collected again for a while (G1): same guest, same code, no second sign-in row.
    const again = (await collect(id, secret)).json() as { status: string; token: string; code: string };
    assert.equal(again.status, 'approved');
    assert.equal(again.code, handed.code);
    assert.equal((await me(again.token)).json().id, (await me(handed.token)).json().id);
    assert.equal((await collect(id, 'not-the-secret')).statusCode, 404);
    db.prepare("UPDATE guest_code_requests SET collected_at = datetime('now', '-11 minutes') WHERE id = ?").run(id);
    assert.equal((await collect(id, secret)).statusCode, 404, 'not after the window');

    // The code works on the other device, as the same guest.
    const other = await enter({ code: handed.code });
    assert.equal(other.statusCode, 200);
    assert.equal((await me(other.json().token)).json().id, (await me(handed.token)).json().id);

    const [listing] = (await panel()).codes;
    assert.deepEqual(
      listing.signins.map((s) => s.platform),
      [null, 'android'],
    );
  });

  it('hides everything from a wrong secret', async () => {
    const { id } = (await request({})).json() as { id: number };
    assert.equal((await collect(id, 'not-the-secret')).statusCode, 404);
    assert.equal((await collect(id + 1, 'anything')).statusCode, 404);
  });

  it('tells the device when it was denied, or nobody answered in a day', async () => {
    const denied = (await request({ name: 'A' })).json() as { id: number; secret: string };
    const ignored = (await request({ name: 'B' })).json() as { id: number; secret: string };

    const res = await app.inject({
      method: 'POST',
      url: `/api/guest-codes/requests/${denied.id}/deny`,
      headers: adminAuth,
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual((await collect(denied.id, denied.secret)).json(), { status: 'denied' });

    db.prepare("UPDATE guest_code_requests SET created_at = datetime('now', '-25 hours') WHERE id = ?").run(
      ignored.id,
    );
    assert.deepEqual((await collect(ignored.id, ignored.secret)).json(), { status: 'expired' });
    const approve = await app.inject({
      method: 'POST',
      url: `/api/guest-codes/requests/${ignored.id}/approve`,
      headers: adminAuth,
    });
    assert.equal(approve.statusCode, 404);
  });

  it('stopping the wait withdraws the request, only with its secret', async () => {
    const { id, secret } = (await request({ name: 'Gone' })).json() as { id: number; secret: string };
    const cancel = (s: string) =>
      app.inject({ method: 'POST', url: `/api/auth/guest/requests/${id}/cancel`, payload: { secret: s } });

    assert.equal((await cancel('wrong')).statusCode, 404);
    assert.equal((await cancel(secret)).statusCode, 204);
    assert.equal((await panel()).requests.length, 0);
    assert.equal((await collect(id, secret)).statusCode, 404);
  });

  it('reports a revoked approval as expired', async () => {
    const { id, secret } = (await request({})).json() as { id: number; secret: string };
    await app.inject({ method: 'POST', url: `/api/guest-codes/requests/${id}/approve`, headers: adminAuth });
    const [listing] = (await panel()).codes;
    await app.inject({ method: 'DELETE', url: `/api/guest-codes/${listing.id}`, headers: adminAuth });

    assert.deepEqual((await collect(id, secret)).json(), { status: 'expired' });
  });

  it('rate limits per address and caps the queue', async () => {
    config.guestRequestsPerHour = 2;
    assert.equal((await request({})).statusCode, 201);
    assert.equal((await request({})).statusCode, 201);
    assert.equal((await request({})).statusCode, 429);

    resetAllRateLimiters();
    config.guestRequestsPerHour = 100;
    config.maxPendingGuestRequests = 2;
    assert.equal((await request({})).statusCode, 503);
  });

  it('rate limits collect and cancel per address', async () => {
    config.guestRequestPollsPerMinute = 3;
    const cancel = () =>
      app.inject({ method: 'POST', url: '/api/auth/guest/requests/999/cancel', payload: { secret: 'x' } });

    assert.equal((await collect(999, 'x')).statusCode, 404);
    assert.equal((await cancel()).statusCode, 404);
    assert.equal((await collect(999, 'x')).statusCode, 404);

    const refusedCollect = await collect(999, 'x');
    assert.equal(refusedCollect.statusCode, 429);
    assert.ok(Number(refusedCollect.headers['retry-after']) > 0);
    assert.equal((await cancel()).statusCode, 429);
  });

  it('approve and deny are admin-only', async () => {
    const { id } = (await request({})).json() as { id: number };
    const guest = (await enter({})).json().token;
    for (const action of ['approve', 'deny']) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/guest-codes/requests/${id}/${action}`,
        headers: { authorization: `Bearer ${guest}` },
      });
      assert.equal(res.statusCode, 403, action);
    }
  });
});
