import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance, RouteOptions } from 'fastify';
import { buildApp, API_PREFIX } from '../app.js';
import { insertGuest, insertUser } from '../db/users.js';
import { signToken } from '../services/token.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * Guests are listen-only (A37). Every route's gate is read off its preHandlers and checked against this table, so a
 * new or changed route fails until classified; then a guest token is tried on each.
 */

type Gate = 'public' | 'guest' | 'account' | 'admin' | 'custom';

const EXPECTED: Record<string, Gate> = {
  // No token at all: the ways in, and liveness.
  'POST /auth/guest': 'public',
  'POST /auth/guest/requests': 'public',
  'POST /auth/guest/requests/:id/collect': 'public',
  'POST /auth/guest/requests/:id/cancel': 'public',
  'POST /auth/login': 'public',
  'POST /auth/passcode-login': 'public',
  // The invite link is the credential (A107-A112).
  'GET /invites/:token': 'public',
  'POST /invites/:token/accept': 'public',
  'GET /auth/registration-status': 'public',
  'GET /health': 'public',
  // No preHandler, but not open: the socket's first message must carry a valid token (`routes/rooms.ts`).
  'GET /rooms/ws': 'public',
  // Any signed-in user, guests included. `/admin/health` too: the empty-library screen shows a guest a running scan.
  'GET /admin/health': 'guest',
  'GET /albums': 'guest',
  'GET /albums/:id': 'guest',
  'GET /albums/:id/cover': 'guest',
  'GET /genres': 'guest',
  'GET /genres/:id': 'guest',
  'GET /artists': 'guest',
  'GET /artists/:id': 'guest',
  'GET /auth/me': 'guest',
  'POST /auth/media-token': 'guest',
  'GET /browse/letters': 'guest',
  'GET /browse/shuffled': 'guest',
  'DELETE /me/playback-state': 'guest',
  'GET /me/playback-state': 'guest',
  'PUT /me/playback-state': 'guest',
  'GET /search': 'guest',
  // Public playlists: guests see and play them (A163).
  'GET /playlists/public': 'guest',
  'GET /playlists/:id': 'guest',
  // Profiles (A167): anyone signed in can look; only an account has one to change.
  'GET /people': 'guest',
  'GET /users/:id/profile': 'guest',
  'GET /users/:id/liked': 'guest',
  'GET /users/:id/disliked': 'guest',
  'GET /users/:id/avatar': 'guest',
  // Guests join rooms with full controls (A100).
  'POST /rooms': 'guest',
  'GET /rooms/mine': 'guest',
  'POST /rooms/leave': 'guest',
  'GET /rooms/:code': 'guest',
  'POST /shuffle': 'guest',
  'GET /library/stats': 'guest',
  'PUT /me/theme': 'guest',
  'PUT /me/name': 'guest',
  'GET /tracks': 'guest',
  'GET /tracks/:id': 'guest',
  'GET /tracks/:id/cover': 'guest',
  'POST /tracks/:id/playback-failure': 'guest',
  'POST /tracks/:id/prepare': 'guest',
  'GET /tracks/:id/stream': 'guest',
  'GET /tracks/:id/waveform': 'guest',
  // Real accounts only: anything that builds up personal data (A37).
  'DELETE /auth/passcode': 'account',
  'POST /auth/passcode': 'account',
  'PUT /me/email': 'account',
  'GET /me/favorites': 'account',
  'GET /me/favorites/ids': 'account',
  'GET /me/less-often/ids': 'account',
  'GET /me/less-often': 'account',
  'GET /me/stats': 'account',
  'GET /me/stats/tracks/:id': 'account',
  'PATCH /me/history/:id': 'account',
  'DELETE /me/less-often': 'account',
  'GET /me/history': 'account',
  'GET /playlists': 'account',
  'POST /playlists': 'account',
  'DELETE /playlists/:id': 'account',
  'PATCH /playlists/:id': 'account',
  'POST /playlists/:id/copy': 'account',
  'PUT /me/profile': 'account',
  'PUT /me/avatar': 'account',
  'DELETE /me/avatar': 'account',
  'POST /playlists/:id/tracks': 'account',
  'DELETE /playlists/:id/tracks/:trackId': 'account',
  'PATCH /playlists/:id/tracks/reorder': 'account',
  'GET /stats/top-tracks': 'account',
  'DELETE /tracks/:id/favorite': 'account',
  'PUT /tracks/:id/favorite': 'account',
  'DELETE /tracks/:id/less-often': 'account',
  'PUT /tracks/:id/less-often': 'account',
  'GET /tracks/:id/history': 'account',
  'POST /tracks/:id/scrobble': 'account',
  // Admin only (A14).
  'GET /admin/control-center': 'admin',
  'GET /admin/loudness': 'admin',
  'GET /admin/rooms': 'admin',
  'GET /admin/invites': 'admin',
  'POST /admin/invites': 'admin',
  'DELETE /admin/invites/:id': 'admin',
  'GET /admin/playback-failures': 'admin',
  'GET /library/browse': 'admin',
  'GET /library/missing': 'admin',
  'GET /library/roots': 'admin',
  'POST /library/roots': 'admin',
  'DELETE /library/roots/:id': 'admin',
  'POST /library/roots/:id/scan': 'admin',
  'POST /library/scan': 'admin',
  'PATCH /tracks': 'admin',
  'POST /tracks/delete': 'admin',
  'DELETE /tracks/:id': 'admin',
  'PATCH /tracks/:id': 'admin',
  'POST /tracks/upload': 'admin',
  'GET /users': 'admin',
  'DELETE /users/:id': 'admin',
  'PATCH /users/:id': 'admin',
  'GET /guest-codes': 'admin',
  'POST /guest-codes': 'admin',
  'PUT /guest-codes/settings': 'admin',
  'DELETE /guest-codes/:id': 'admin',
  'POST /guest-codes/requests/:id/approve': 'admin',
  'POST /guest-codes/requests/:id/deny': 'admin',
  // Gated by hand: open while the users table is empty, admin-only after (A16).
  'POST /auth/register': 'custom',
};

let app: FastifyInstance;
const actual: Record<string, Gate> = {};

function gateOf(route: RouteOptions): Gate {
  const handlers = [route.preHandler ?? []].flat();
  if (handlers.length === 0) return 'public';
  if (handlers.includes(app.requireAdmin)) return 'admin';
  if (handlers.includes(app.requireAccount)) return 'account';
  if (handlers.every((h) => h === app.authenticate || h === app.authenticateMedia)) return 'guest';
  return 'custom';
}

before(async () => {
  app = buildApp();
  app.addHook('onRoute', (route) => {
    if (!route.url.startsWith(`${API_PREFIX}/`)) return;
    for (const method of [route.method].flat()) {
      // HEAD is generated for every GET, OPTIONS by CORS; neither is a route anyone wrote.
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      actual[`${method} ${route.url.slice(API_PREFIX.length)}`] = gateOf(route);
    }
  });
  await app.ready();
});

after(async () => {
  await app.close();
});

describe('route classification', () => {
  it('every API route carries exactly the gate the table says', () => {
    assert.deepEqual(actual, EXPECTED);
  });
});

describe('guest token against the running app', () => {
  let guestToken: string;
  let accountToken: string;

  beforeEach(() => {
    resetDatabase();
    const guest = insertGuest();
    guestToken = signToken({ id: guest.id, username: guest.username });
    const account = insertUser('listener', 'unused-hash');
    accountToken = signToken({ id: account.id, username: account.username });
  });

  function routesWith(gate: Gate) {
    return Object.entries(EXPECTED)
      .filter(([, g]) => g === gate)
      .map(([key]) => {
        const [method, url] = key.split(' ');
        return { method: method as 'GET', url: API_PREFIX + url.replace(/:[a-zA-Z]+/g, '1') };
      });
  }

  it('refuses a guest on every account-only route', async () => {
    const routes = routesWith('account');
    assert.ok(routes.length > 0);
    for (const { method, url } of routes) {
      const res = await app.inject({ method, url, headers: { authorization: `Bearer ${guestToken}` } });
      assert.equal(res.statusCode, 403, `${method} ${url} let a guest through (${res.statusCode})`);
    }
  });

  it('lets an account past the gate on every account-only route', async () => {
    for (const { method, url } of routesWith('account')) {
      const res = await app.inject({ method, url, headers: { authorization: `Bearer ${accountToken}` } });
      assert.notEqual(res.statusCode, 403, `${method} ${url} refused an account`);
    }
  });

  it('lets a guest past the gate on every guest-allowed route', async () => {
    for (const { method, url } of routesWith('guest')) {
      const res = await app.inject({ method, url, headers: { authorization: `Bearer ${guestToken}` } });
      assert.notEqual(res.statusCode, 403, `${method} ${url} refused a guest`);
      assert.notEqual(res.statusCode, 401, `${method} ${url} did not accept a guest token`);
    }
  });
});
