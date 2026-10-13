import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { db } from '../db/connection.js';
import {
  cancelGuestCodeRequest,
  collectGuestCodeRequest,
  countPendingRequests,
  createGuestCodeRequest,
} from '../db/guestCodeRequests.js';
import { claimGuestCode, guestCodesRequired, peekGuestCode, recordGuestCodeSignin } from '../db/guestCodes.js';
import {
  cleanDisplayName,
  clearPasscodeById,
  countAccounts,
  countGuests,
  findUserById,
  findUserByUsername,
  insertGuest,
  insertUser,
  nameOf,
  pruneIdleGuests,
  randomGuestName,
  setAdmin,
  setDisplayName,
  setPasscodeHashById,
  setUserTheme,
  touchLastSeen,
  type UserRow,
} from '../db/users.js';
import { hashPasscode, hashPassword, verifyPasscode, verifyPassword } from '../services/password.js';
import { createRateLimiter, type RateLimiter, type RateLimitResult } from '../services/rateLimit.js';
import { signMediaToken, signToken, tokenExpiresAt, type TokenUser } from '../services/token.js';
import { clientIp } from '../utils/clientIp.js';

interface Credentials {
  username: string;
  password: string;
}

interface PasscodeLogin {
  username: string;
  passcode: string;
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,32}$/;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Why `username` can't be an account name, or undefined if it can. Checked on the server because register and invite
 * accept are reachable without the web client. `guest-` is reserved for minted guests (A112).
 */
export function usernameProblem(username: string): string | undefined {
  if (!USERNAME_PATTERN.test(username)) {
    return 'username must be 2-32 characters: letters, digits, dot, dash or underscore';
  }
  if (username.toLowerCase().startsWith('guest-')) return 'usernames starting with "guest-" are reserved';
  return undefined;
}
const PASSCODE_PATTERN = /^\d{4,8}$/;
/** A web theme id (`frontend/src/lib/theme.ts`): lowercase, short. */
const THEME_ID = /^[a-z][a-z0-9-]{0,31}$/;

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const guestMintLimiter = createRateLimiter();
const guestRequestLimiter = createRateLimiter();

/** Which client signed in, for the admin's sign-in log (A69). Anything else is stored as unknown. */
function platformOf(input: unknown): string | null {
  return input === 'web' || input === 'android' ? input : null;
}

function signinDetails(request: FastifyRequest, platform: string | null) {
  const userAgent = request.headers['user-agent'];
  return { platform, userAgent: typeof userAgent === 'string' ? userAgent : null, ip: clientIp(request) };
}
/** What a session token carries for `user`, its current session version included (C8). */
function tokenUserOf(user: UserRow): TokenUser {
  return { id: user.id, username: user.username, sessionVersion: user.session_version };
}

const passcodeLoginLimiter = createRateLimiter();
const passwordLoginLimiter = createRateLimiter();
/** Failed sign-ins per username, from every address together, so rotating addresses buys no extra guesses. */
const accountLoginLimiter = createRateLimiter();

/*
 * Sign-in limits count failures only. A success neither spends the budget (a household signing in one after another
 * is never refused) nor clears it: clearing let anyone with an account reset their address's window by signing in to
 * their own, and keep guessing someone else's passcode.
 */
function loginLimitFor(byIp: RateLimiter, ip: string, perMinute: number, username: string): RateLimitResult {
  const ipRate = byIp.peek(ip, { limit: perMinute, windowMs: MINUTE_MS });
  if (!ipRate.allowed) return ipRate;
  return accountLoginLimiter.peek(username, { limit: config.accountLoginFailuresPerHour, windowMs: HOUR_MS });
}

function countLoginFailure(byIp: RateLimiter, ip: string, perMinute: number, username: string): void {
  byIp.check(ip, { limit: perMinute, windowMs: MINUTE_MS });
  accountLoginLimiter.check(username, { limit: config.accountLoginFailuresPerHour, windowMs: HOUR_MS });
}

function tooManyTries(reply: FastifyReply, rate: RateLimitResult) {
  return reply
    .code(429)
    .header('retry-after', String(rate.retryAfterSeconds))
    .send({ error: 'Too many tries. Wait a moment.' });
}

/** Constant-time compare. Unequal lengths short-circuit, leaking only the code's length. */
function secretMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || expected === '') return false;

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  return a.length === b.length && timingSafeEqual(a, b);
}

const authRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Whether an anonymous visitor may create an account: open registration is on, or there are no accounts yet
   * (counted without guests), which breaks the no-admin deadlock. `POST /auth/register` reads the same rule.
   */
  function isRegistrationOpen(): boolean {
    return config.allowOpenRegistration || countAccounts() === 0;
  }

  /** Under the guest cap, pruning idle guests first if needed. False when the server is full. */
  function makeRoomForGuest(request: FastifyRequest): boolean {
    if (countGuests() < config.maxGuests) return true;

    const pruned = pruneIdleGuests(config.guestIdleDays);
    if (pruned > 0) {
      request.log.info(`Pruned ${pruned} idle guest(s) to make room for a new one`);
    }
    return countGuests() < config.maxGuests;
  }

  fastify.get('/auth/registration-status', async (_request, reply) => {
    return reply.send({ open: isRegistrationOpen(), firstAccount: countAccounts() === 0 });
  });

  /**
   * The guest door. A per-guest code signs in as that code's guest (A69): the first use mints it, named from `name`
   * (A68), and later uses on any device join it. Without one, mints a fresh guest when the door is open or the shared
   * `ENTRY_CODE` matches. Public by necessity; rate limited per IP.
   */
  fastify.post<{ Body: { code?: unknown; name?: unknown; platform?: unknown } }>(
    '/auth/guest',
    async (request, reply) => {
      const rate = guestMintLimiter.check(clientIp(request), {
        limit: config.guestMintsPerHour,
        windowMs: HOUR_MS,
      });

      if (!rate.allowed) {
        return reply
          .code(429)
          .header('retry-after', String(rate.retryAfterSeconds))
          .send({ error: 'Too many guest sessions from this address. Try again shortly.' });
      }

      const name = cleanDisplayName(request.body?.name);
      if (name === undefined) {
        return reply.code(400).send({ error: 'name must be text, at most 32 characters' });
      }

      // Closed by `ENTRY_CODE` (A15) or the admin's per-guest-code toggle (A43); neither set means open. The shared
      // code admits any number of new guests.
      const code = request.body?.code;
      const doorClosed = config.entryCode !== '' || guestCodesRequired();
      const sharedCodeOk = secretMatches(code, config.entryCode);
      const hasCode = typeof code === 'string' && code.trim() !== '';
      const codeState = hasCode && !sharedCodeOk ? peekGuestCode(code, config.guestIdleDays) : undefined;

      // A code that was typed but isn't right is refused even with the door open, rather than quietly minting a
      // stranger in place of the guest the person meant to be.
      if ((hasCode && !sharedCodeOk && !codeState) || (doorClosed && !sharedCodeOk && !codeState)) {
        return reply.code(401).send({ error: 'That code is not right' });
      }

      // The cap bounds table growth; the rate limit is the defence. Pruning runs only here, under pressure. Joining a
      // guest that exists adds nothing, so it skips the cap.
      if (codeState !== 'bound' && !makeRoomForGuest(request)) {
        return reply.code(503).send({ error: 'This server is not accepting new guests right now' });
      }

      if (codeState) {
        const claimed = claimGuestCode(code, name, config.guestIdleDays);
        // Revoked, or gone idle, between the check above and here.
        if (!claimed) return reply.code(401).send({ error: 'That code is not right' });

        recordGuestCodeSignin(claimed.codeId, signinDetails(request, platformOf(request.body?.platform)));
        request.log.info(`${claimed.minted ? 'Minted' : 'Signed in'} guest ${claimed.user.username} on a guest code`);
        return reply
          .code(claimed.minted ? 201 : 200)
          .send({ token: signToken(tokenUserOf(claimed.user)) });
      }

      const guest = insertGuest(name);
      request.log.info(`Minted guest ${guest.username}`);
      return reply.code(201).send({ token: signToken(tokenUserOf(guest)) });
    },
  );

  /** "Request a code" (A67): queues a request for the admin and hands the device an id and secret to poll with. */
  fastify.post<{ Body: { name?: unknown; platform?: unknown } }>('/auth/guest/requests', async (request, reply) => {
    const rate = guestRequestLimiter.check(clientIp(request), {
      limit: config.guestRequestsPerHour,
      windowMs: HOUR_MS,
    });

    if (!rate.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(rate.retryAfterSeconds))
        .send({ error: 'Too many requests from this address. Try again later.' });
    }

    const name = cleanDisplayName(request.body?.name);
    if (name === undefined) {
      return reply.code(400).send({ error: 'name must be text, at most 32 characters' });
    }

    if (countPendingRequests() >= config.maxPendingGuestRequests) {
      return reply.code(503).send({ error: 'Too many requests are waiting already. Try again later.' });
    }

    const created = createGuestCodeRequest(name, platformOf(request.body?.platform), clientIp(request));
    request.log.info(`Guest code request ${created.id} from ${name || 'an unnamed guest'}`);
    return reply.code(201).send(created);
  });

  /**
   * The waiting device's poll. `pending`, `denied` or `expired`; once approved, the guest's token and code, handed over
   * once. 404 for an unknown id, a wrong secret or a request already collected.
   */
  /** "Stop waiting": withdraws a pending request. 404 when it isn't pending or the secret is wrong. */
  fastify.post<{ Params: { id: string }; Body: { secret?: unknown } }>(
    '/auth/guest/requests/:id/cancel',
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || !cancelGuestCodeRequest(id, request.body?.secret)) {
        return reply.code(404).send({ error: 'Request not found' });
      }
      return reply.code(204).send();
    },
  );

  fastify.post<{ Params: { id: string }; Body: { secret?: unknown } }>(
    '/auth/guest/requests/:id/collect',
    async (request, reply) => {
      const id = Number(request.params.id);
      const result = Number.isInteger(id) ? collectGuestCodeRequest(id, request.body?.secret) : undefined;
      if (!result) return reply.code(404).send({ error: 'Request not found' });

      if (result.status !== 'approved') return reply.send({ status: result.status });

      // A repeat is the same sign-in arriving again, not a new one.
      if (!result.repeat) recordGuestCodeSignin(result.codeId, signinDetails(request, result.platform));
      request.log.info(`Guest ${result.user.username} collected request ${id}${result.repeat ? ' again' : ''}`);
      return reply.send({
        status: 'approved',
        token: signToken(tokenUserOf(result.user)),
        code: result.code,
      });
    },
  );

  /** Gated by hand because the gate is conditional; on a failed `authenticate` the 401 is already sent. */
  fastify.post<{ Body: Credentials }>(
    '/auth/register',
    {
      preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
        if (isRegistrationOpen()) return;
        await fastify.authenticate(request, reply);
        if (!request.user) return;
        await fastify.requireAdmin(request, reply);
      },
    },
    async (request, reply) => {
      const { username, password } = request.body ?? ({} as Credentials);

      if (!username || !password) {
        return reply.code(400).send({ error: 'username and password are required' });
      }

      // Validated here, not only in the browser: with open registration this
      // endpoint is reachable by anyone, so the client is not a gate.
      const problem = usernameProblem(username);
      if (problem) return reply.code(400).send({ error: problem });

      if (password.length < MIN_PASSWORD_LENGTH) {
        return reply
          .code(400)
          .send({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }

      // Guests hold names in the same UNIQUE column, so this also stops an
      // account being registered over a live guest's identity.
      if (findUserByUsername(username)) {
        return reply.code(409).send({ error: 'username already taken' });
      }

      const passwordHash = await hashPassword(password);

      // Decided after the only await, in one synchronous transaction: two sign-ups racing on an empty server used to both
      // count zero accounts before hashing and both become admin (C25), and a name taken meanwhile hit the UNIQUE
      // constraint as a 500.
      const outcome = db.transaction(() => {
        if (findUserByUsername(username)) return 'taken' as const;
        const isBootstrap = countAccounts() === 0;
        // Let through only because the server was empty, and someone else has claimed it since.
        if (!isBootstrap && !request.user && !config.allowOpenRegistration) return 'closed' as const;
        const user = insertUser(username, passwordHash);
        if (isBootstrap) setAdmin(user.username, true);
        return { user, isBootstrap };
      })();

      if (outcome === 'taken') return reply.code(409).send({ error: 'username already taken' });
      if (outcome === 'closed') return reply.code(401).send({ error: 'Registration is closed' });
      const { user, isBootstrap } = outcome;
      return reply.code(201).send({ id: user.id, username: user.username, isAdmin: isBootstrap });
    },
  );

  fastify.post<{ Body: Credentials }>('/auth/login', async (request, reply) => {
    const { username, password } = request.body ?? ({} as Credentials);

    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password are required' });
    }

    const ip = clientIp(request);
    const limit = config.loginAttemptsPerMinute;
    const rate = loginLimitFor(passwordLoginLimiter, ip, limit, String(username));
    if (!rate.allowed) return tooManyTries(reply, rate);

    const user = findUserByUsername(username);

    // Guests are refused before bcrypt, as a stated rule rather than a lost comparison.
    if (!user || user.kind === 'guest' || !(await verifyPassword(password, user.password_hash))) {
      countLoginFailure(passwordLoginLimiter, ip, limit, String(username));
      return reply.code(401).send({ error: 'invalid username or password' });
    }

    const token = signToken(tokenUserOf(user));
    return reply.send({ token });
  });

  /** Username plus a short numeric passcode. Rate-limited (default 8 failures/minute per IP), since the keyspace is small. */
  fastify.post<{ Body: PasscodeLogin }>('/auth/passcode-login', async (request, reply) => {
    const { username, passcode } = request.body ?? ({} as PasscodeLogin);

    if (!username || !passcode) {
      return reply.code(400).send({ error: 'username and passcode are required' });
    }

    const ip = clientIp(request);
    const limit = config.passcodeAttemptsPerMinute;
    const rate = loginLimitFor(passcodeLoginLimiter, ip, limit, String(username));
    if (!rate.allowed) return tooManyTries(reply, rate);

    const user = findUserByUsername(username);

    // Same refusal shape as `/auth/login`: no user, a guest, no passcode ever
    // set, or a wrong one, all look identical from the outside.
    if (
      !user ||
      user.kind === 'guest' ||
      !user.passcode_hash ||
      !(await verifyPasscode(passcode, user.passcode_hash))
    ) {
      countLoginFailure(passcodeLoginLimiter, ip, limit, String(username));
      return reply.code(401).send({ error: 'invalid username or passcode' });
    }

    const token = signToken(tokenUserOf(user));
    return reply.send({ token });
  });

  /** Creates or replaces the signed-in account's own passcode. */
  fastify.post<{ Body: { passcode?: unknown } }>(
    '/auth/passcode',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const passcode = request.body?.passcode;
      if (typeof passcode !== 'string' || !PASSCODE_PATTERN.test(passcode)) {
        return reply.code(400).send({ error: 'passcode must be 4-8 digits' });
      }

      const passcodeHash = await hashPasscode(passcode);
      setPasscodeHashById(request.user!.id, passcodeHash);
      return reply.code(204).send();
    },
  );

  fastify.delete('/auth/passcode', { preHandler: [fastify.authenticate, fastify.requireAccount] }, async (request, reply) => {
    clearPasscodeById(request.user!.id);
    return reply.code(204).send();
  });

  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = findUserById(request.user!.id);
    if (!user) {
      return reply.code(404).send({ error: 'user not found' });
    }

    // The one place last-seen is written: once per client wake-up is enough for a prune measured in days.
    touchLastSeen(user.id);

    return reply.send({
      id: user.id,
      username: user.username,
      displayName: nameOf(user),
      isAdmin: Boolean(user.is_admin),
      isGuest: user.kind === 'guest',
      hasPasscode: Boolean(user.passcode_hash),
      theme: user.theme,
      // So the header's picture button needs no second request (A171).
      avatarId: user.avatar_id,
    });
  });

  // Guests too: each guest identity keeps its own theme (A55). The id list lives in the web client; only the shape is
  // checked here, so a theme added there needs no server change.
  fastify.put<{ Body: { theme?: unknown } }>('/me/theme', { preHandler: fastify.authenticate }, async (request, reply) => {
    const theme = request.body?.theme;
    if (typeof theme !== 'string' || !THEME_ID.test(theme)) {
      return reply.code(400).send({ error: 'theme must be a theme id like "blue"' });
    }
    setUserTheme(request.user!.id, theme);
    return reply.code(204).send();
  });

  // Guests and accounts alike. Empty clears it: an account shows its username again, a guest gets a new `Guest NNNN`.
  fastify.put<{ Body: { name?: unknown } }>('/me/name', { preHandler: fastify.authenticate }, async (request, reply) => {
    const name = cleanDisplayName(request.body?.name);
    if (name === undefined || request.body?.name === undefined) {
      return reply.code(400).send({ error: 'name must be text, at most 32 characters' });
    }

    const user = findUserById(request.user!.id)!;
    const stored = name || (user.kind === 'guest' ? randomGuestName() : null);
    setDisplayName(user.id, stored);
    return reply.send({ displayName: stored ?? user.username });
  });

  // Swaps a session token for a short-lived media token for `<audio src>` / `<img src>`. Clients cache it until `expiresAt`.
  fastify.post('/auth/media-token', { preHandler: fastify.authenticate }, async (request, reply) => {
    const token = signMediaToken(request.user!);
    return reply.send({ token, expiresAt: new Date(tokenExpiresAt(token)).toISOString() });
  });
};

export default authRoute;
