import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { config } from '../config.js';
import { db } from '../db/connection.js';
import { normalizeGuestCode } from '../db/guestCodes.js';
import { deleteUser, findUserByUsername, insertUser, pruneIdleGuests, setAdmin } from '../db/users.js';
import { hashPassword } from '../services/password.js';
import { resetAllRateLimiters } from '../services/rateLimit.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * Per-guest entry codes (A42/A43): one use, 7 days, and an admin toggle that
 * decides whether the guest door asks for one.
 */

interface Listing {
  id: number;
  code: string;
  status: 'active' | 'used' | 'expired';
  usedBy: string | null;
}

let app: FastifyInstance;
let adminAuth: { authorization: string };
let originalEntryCode: string;

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
  config.entryCode = '';

  const admin = insertUser('boss', await hashPassword('correct horse battery staple'));
  setAdmin('boss', true);
  adminAuth = { authorization: `Bearer ${signToken({ id: admin.id, username: admin.username })}` };
});

afterEach(() => {
  config.entryCode = originalEntryCode;
});

async function newCode(): Promise<Listing> {
  const res = await app.inject({ method: 'POST', url: '/api/guest-codes', headers: adminAuth });
  assert.equal(res.statusCode, 201);
  return res.json() as Listing;
}

async function requireCodes(required: boolean) {
  const res = await app.inject({
    method: 'PUT',
    url: '/api/guest-codes/settings',
    headers: adminAuth,
    payload: { required },
  });
  assert.equal(res.statusCode, 200);
}

function enter(code?: string) {
  return app.inject({ method: 'POST', url: '/api/auth/guest', payload: code === undefined ? {} : { code } });
}

describe('guest codes', () => {
  it('leaves the door open by default, codes or not', async () => {
    await newCode();
    assert.equal((await enter()).statusCode, 201);
  });

  it('refuses a guest without a code once the toggle is on', async () => {
    await requireCodes(true);
    assert.equal((await enter()).statusCode, 401);
    assert.equal((await enter('ABCDEFGH')).statusCode, 401);
  });

  it('lets one device in per code, then reports who used it', async () => {
    await requireCodes(true);
    const { code } = await newCode();

    // Typed lower-case with a dash, as a person reading it off a card would.
    const pretty = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    assert.equal((await enter(pretty)).statusCode, 201);
    assert.equal((await enter(code)).statusCode, 401, 'a used code must not let a second device in');

    const panel = await app.inject({ method: 'GET', url: '/api/guest-codes', headers: adminAuth });
    const [listing] = (panel.json() as { codes: Listing[] }).codes;
    assert.equal(listing.status, 'used');
    assert.match(listing.usedBy ?? '', /^guest-/);
  });

  it('refuses an expired code', async () => {
    await requireCodes(true);
    const { id, code } = await newCode();
    db.prepare("UPDATE guest_codes SET expires_at = datetime('now', '-1 minute') WHERE id = ?").run(id);

    assert.equal((await enter(code)).statusCode, 401);
  });

  it('refuses a revoked code', async () => {
    await requireCodes(true);
    const { id, code } = await newCode();
    const res = await app.inject({ method: 'DELETE', url: `/api/guest-codes/${id}`, headers: adminAuth });
    assert.equal(res.statusCode, 204);

    assert.equal((await enter(code)).statusCode, 401);
  });

  it('still accepts the shared ENTRY_CODE alongside per-guest codes', async () => {
    await requireCodes(true);
    config.entryCode = 'house-code';
    assert.equal((await enter('house-code')).statusCode, 201);
    assert.equal((await enter('house-code')).statusCode, 201, 'the shared code is not one-use');
  });

  it('never returns the shared ENTRY_CODE itself', async () => {
    config.entryCode = 'house-code';
    const res = await app.inject({ method: 'GET', url: '/api/guest-codes', headers: adminAuth });
    assert.equal(res.json().sharedCodeSet, true);
    assert.ok(!res.body.includes('house-code'));
  });

  it('is admin-only', async () => {
    const guest = (await enter()).json() as { token: string };
    const headers = { authorization: `Bearer ${guest.token}` };

    for (const [method, url] of [
      ['GET', '/api/guest-codes'],
      ['POST', '/api/guest-codes'],
      ['PUT', '/api/guest-codes/settings'],
      ['DELETE', '/api/guest-codes/1'],
    ] as const) {
      const res = await app.inject({ method, url, headers, payload: { required: false } });
      assert.equal(res.statusCode, 403, `${method} ${url}`);
    }
    assert.equal((await app.inject({ method: 'GET', url: '/api/guest-codes' })).statusCode, 401);
  });

  it('rejects a toggle that is not a boolean', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/guest-codes/settings',
      headers: adminAuth,
      payload: { required: 'yes' },
    });
    assert.equal(res.statusCode, 400);
  });

  it('does not block pruning or deleting the guest or admin a code points at', async () => {
    await requireCodes(true);
    const { code } = await newCode();
    await enter(code);

    db.prepare("UPDATE users SET last_seen_at = datetime('now', '-400 days') WHERE kind = 'guest'").run();
    assert.equal(pruneIdleGuests(30), 1);

    await newCode();
    assert.equal(deleteUser(findUserByUsername('boss')!.id), true);
  });

  it('normalises what people type', () => {
    assert.equal(normalizeGuestCode(' abcd-efgh '), 'ABCDEFGH');
    assert.equal(normalizeGuestCode(42), '');
  });
});
