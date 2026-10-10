import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { guestCodesRequired, isRedeemableGuestCode, redeemGuestCode } from '../db/guestCodes.js';
import {
  clearPasscodeById,
  countAccounts,
  countGuests,
  findUserById,
  findUserByUsername,
  insertGuest,
  insertUser,
  pruneIdleGuests,
  setAdmin,
  setPasscodeHashById,
  touchLastSeen,
} from '../db/users.js';
import { hashPasscode, hashPassword, verifyPasscode, verifyPassword } from '../services/password.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { signMediaToken, signToken, tokenExpiresAt } from '../services/token.js';
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
const MIN_PASSWORD_LENGTH = 8;
const PASSCODE_PATTERN = /^\d{4,8}$/;

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const guestMintLimiter = createRateLimiter();
const passcodeLoginLimiter = createRateLimiter();
const passwordLoginLimiter = createRateLimiter();

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

  fastify.get('/auth/registration-status', async (_request, reply) => {
    return reply.send({ open: isRegistrationOpen(), firstAccount: countAccounts() === 0 });
  });

  /**
   * The guest door: mints a passwordless user and returns an ordinary session token. Public by necessity, so on an
   * exposed server anyone can listen; the gate belongs at the network edge (box 13), `ENTRY_CODE` is the backstop.
   */
  fastify.post<{ Body: { code?: unknown } }>('/auth/guest', async (request, reply) => {
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

    // Closed by `ENTRY_CODE` (A15) or the admin's per-guest-code toggle (A43); neither set means open. The shared code
    // admits any number of devices; a per-guest code is burnt below once the cap allows.
    const code = request.body?.code;
    const doorClosed = config.entryCode !== '' || guestCodesRequired();
    const sharedCodeOk = secretMatches(code, config.entryCode);

    if (doorClosed && !sharedCodeOk && !isRedeemableGuestCode(code)) {
      return reply.code(401).send({ error: 'That code is not right' });
    }

    // The cap bounds table growth; the rate limit is the defence. Pruning runs only here, under pressure.
    if (countGuests() >= config.maxGuests) {
      const pruned = pruneIdleGuests(config.guestIdleDays);
      if (pruned > 0) {
        request.log.info(`Pruned ${pruned} idle guest(s) to make room for a new one`);
      }

      if (countGuests() >= config.maxGuests) {
        return reply
          .code(503)
          .send({ error: 'This server is not accepting new guests right now' });
      }
    }

    let guest;
    if (doorClosed && !sharedCodeOk) {
      guest = redeemGuestCode(code);
      // Spent by a racing device between the check above and here.
      if (!guest) return reply.code(401).send({ error: 'That code is not right' });
      request.log.info(`Minted guest ${guest.username} on a guest code`);
    } else {
      guest = insertGuest();
      request.log.info(`Minted guest ${guest.username}`);
    }

    return reply.code(201).send({ token: signToken({ id: guest.id, username: guest.username }) });
  });

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
      if (!USERNAME_PATTERN.test(username)) {
        return reply.code(400).send({
          error: 'username must be 2-32 characters: letters, digits, dot, dash or underscore',
        });
      }

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

      // Measured right before the insert, since it decides whether the new account is admin.
      const isBootstrap = countAccounts() === 0;

      const passwordHash = await hashPassword(password);
      const user = insertUser(username, passwordHash);
      if (isBootstrap) setAdmin(user.username, true);

      return reply.code(201).send({ id: user.id, username: user.username, isAdmin: isBootstrap });
    },
  );

  fastify.post<{ Body: Credentials }>('/auth/login', async (request, reply) => {
    const ip = clientIp(request);
    const rate = passwordLoginLimiter.check(ip, {
      limit: config.loginAttemptsPerMinute,
      windowMs: MINUTE_MS,
    });

    if (!rate.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(rate.retryAfterSeconds))
        .send({ error: 'Too many tries. Wait a moment.' });
    }

    const { username, password } = request.body ?? ({} as Credentials);

    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password are required' });
    }

    const user = findUserByUsername(username);

    // Guests are refused before bcrypt, as a stated rule rather than a lost comparison.
    if (!user || user.kind === 'guest' || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'invalid username or password' });
    }

    // Same as the passcode path: a correct password clears this IP's window,
    // so a household signing in one after another never trips it.
    passwordLoginLimiter.clear(ip);

    const token = signToken({ id: user.id, username: user.username });
    return reply.send({ token });
  });

  /** Username plus a short numeric passcode. Rate-limited per IP (default 8/minute), since the code's keyspace is small. */
  fastify.post<{ Body: PasscodeLogin }>('/auth/passcode-login', async (request, reply) => {
    const rate = passcodeLoginLimiter.check(clientIp(request), {
      limit: config.passcodeAttemptsPerMinute,
      windowMs: MINUTE_MS,
    });

    if (!rate.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(rate.retryAfterSeconds))
        .send({ error: 'Too many tries. Wait a moment.' });
    }

    const { username, passcode } = request.body ?? ({} as PasscodeLogin);

    if (!username || !passcode) {
      return reply.code(400).send({ error: 'username and passcode are required' });
    }

    const user = findUserByUsername(username);

    // Same refusal shape as `/auth/login`: no user, a guest, no passcode ever
    // set, or a wrong one, all look identical from the outside.
    if (
      !user ||
      user.kind === 'guest' ||
      !user.passcode_hash ||
      !(await verifyPasscode(passcode, user.passcode_hash))
    ) {
      return reply.code(401).send({ error: 'invalid username or passcode' });
    }

    // A correct passcode clears this IP's window, as a correct password does.
    passcodeLoginLimiter.clear(clientIp(request));

    const token = signToken({ id: user.id, username: user.username });
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
      isAdmin: Boolean(user.is_admin),
      isGuest: user.kind === 'guest',
      hasPasscode: Boolean(user.passcode_hash),
    });
  });

  // Swaps a session token for a short-lived media token for `<audio src>` / `<img src>`. Clients cache it until `expiresAt`.
  fastify.post('/auth/media-token', { preHandler: fastify.authenticate }, async (request, reply) => {
    const token = signMediaToken(request.user!);
    return reply.send({ token, expiresAt: new Date(tokenExpiresAt(token)).toISOString() });
  });
};

export default authRoute;
