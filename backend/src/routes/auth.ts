import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
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

/**
 * Constant-time compare for a configured secret against something a stranger
 * supplied. Unequal lengths short-circuit, which leaks the length of the
 * configured code and nothing else — a fact worth far less than the timing
 * signal this removes.
 */
function secretMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || expected === '') return false;

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  return a.length === b.length && timingSafeEqual(a, b);
}

const authRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * May an anonymous visitor create an account right now? Two ways to be yes:
   * open registration is configured on, or there are no accounts yet. The
   * empty case is not a policy choice but a deadlock break — admin-only
   * registration plus no admin has no way out.
   *
   * Counts **accounts**, not rows: the first visitor to a fresh server presses
   * "enter" and mints a guest, and if that closed the bootstrap window the
   * server could never be claimed at all.
   *
   * Unauthenticated by design, and now nearly vestigial: the `/signup` page it
   * was written for is gone. It survives because a fresh server still needs to
   * say whether it can be claimed, and because `POST /auth/register` reads the
   * same rule. It leaks one bit ("can I sign up here"), not worth protecting.
   */
  function isRegistrationOpen(): boolean {
    return config.allowOpenRegistration || countAccounts() === 0;
  }

  fastify.get('/auth/registration-status', async (_request, reply) => {
    return reply.send({ open: isRegistrationOpen(), firstAccount: countAccounts() === 0 });
  });

  /**
   * The title screen's front door: no account, no password, no form. Mints a
   * passwordless `users` row and signs the ordinary session token for it — the
   * same token `/auth/login` returns, so every client path downstream (the
   * media-token exchange included) needs no new branch.
   *
   * Unauthenticated by necessity; this *is* the way in. What that means, stated
   * plainly because it is the whole security posture: on a server reachable
   * from outside, anyone who can load the page can listen. The gate belongs at
   * the network edge (roadmap box 13), with `ENTRY_CODE` as the backstop below.
   */
  fastify.post<{ Body: { code?: unknown } }>('/auth/guest', async (request, reply) => {
    const rate = guestMintLimiter.check(request.ip, {
      limit: config.guestMintsPerHour,
      windowMs: HOUR_MS,
    });

    if (!rate.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(rate.retryAfterSeconds))
        .send({ error: 'Too many guest sessions from this address — try again shortly' });
    }

    // Unset (the default, and the LAN posture) means the door is open.
    if (config.entryCode !== '' && !secretMatches(request.body?.code, config.entryCode)) {
      return reply.code(401).send({ error: 'That code is not right' });
    }

    // The ceiling is a bound on how far a loop can grow the table, not a
    // defence — the rate limit above is that. Pruning runs only here, under
    // pressure, so an idle guest on a quiet server is never collected.
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

    const guest = insertGuest();
    request.log.info(`Minted guest ${guest.username}`);

    return reply.code(201).send({ token: signToken({ id: guest.id, username: guest.username }) });
  });

  /**
   * Composed by hand rather than as `preHandler: [authenticate, requireAdmin]`
   * because the gate is conditional. `request.user` is the signal that
   * `authenticate` succeeded: when it fails it has already sent a 401, and
   * calling `requireAdmin` afterwards would try to send a second reply.
   */
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

      // Re-read rather than trusting the preHandler's count: this is what
      // decides whether the new account gets admin, so it must be measured
      // immediately before the insert.
      const isBootstrap = countAccounts() === 0;

      const passwordHash = await hashPassword(password);
      const user = insertUser(username, passwordHash);
      if (isBootstrap) setAdmin(user.username, true);

      return reply.code(201).send({ id: user.id, username: user.username, isAdmin: isBootstrap });
    },
  );

  fastify.post<{ Body: Credentials }>('/auth/login', async (request, reply) => {
    const { username, password } = request.body ?? ({} as Credentials);

    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password are required' });
    }

    const user = findUserByUsername(username);

    // Refused before bcrypt, not by it. A guest's `password_hash` is '' and no
    // hash can equal it, but "this row cannot log in" should be a fact the code
    // states rather than a property of a comparison it happens to lose.
    if (!user || user.kind === 'guest' || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'invalid username or password' });
    }

    const token = signToken({ id: user.id, username: user.username });
    return reply.send({ token });
  });

  /**
   * The arcade-card alternative to `/auth/login` — a username plus a short
   * numeric passcode instead of a password. Rate-limited far more tightly
   * than the password path (`passcodeAttemptsPerMinute`, default 8/minute per
   * IP): a 4-8 digit code has nothing like a password's keyspace, so the
   * limit is doing the work the code's own length can't.
   */
  fastify.post<{ Body: PasscodeLogin }>('/auth/passcode-login', async (request, reply) => {
    const rate = passcodeLoginLimiter.check(request.ip, {
      limit: config.passcodeAttemptsPerMinute,
      windowMs: MINUTE_MS,
    });

    if (!rate.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(rate.retryAfterSeconds))
        .send({ error: 'Too many tries — wait a moment' });
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

    // A correct passcode clears this IP's window, the same courtesy a correct
    // password gets by never having counted against one at all.
    passcodeLoginLimiter.clear(request.ip);

    const token = signToken({ id: user.id, username: user.username });
    return reply.send({ token });
  });

  /** Creates or replaces the signed-in account's own passcode. Self-service only — see `/auth/passcode-login`'s doc comment for why a wrong one can't be told apart from a missing one. */
  fastify.post<{ Body: { passcode?: unknown } }>(
    '/auth/passcode',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const user = findUserById(request.user!.id);
      if (!user || user.kind === 'guest') {
        return reply.code(403).send({ error: 'guests cannot set a passcode' });
      }

      const passcode = request.body?.passcode;
      if (typeof passcode !== 'string' || !PASSCODE_PATTERN.test(passcode)) {
        return reply.code(400).send({ error: 'passcode must be 4-8 digits' });
      }

      const passcodeHash = await hashPasscode(passcode);
      setPasscodeHashById(user.id, passcodeHash);
      return reply.code(204).send();
    },
  );

  fastify.delete('/auth/passcode', { preHandler: fastify.authenticate }, async (request, reply) => {
    clearPasscodeById(request.user!.id);
    return reply.code(204).send();
  });

  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = findUserById(request.user!.id);
    if (!user) {
      return reply.code(404).send({ error: 'user not found' });
    }

    // The one place staleness is recorded. Every request would mean a write per
    // streamed byte range; this fires once when a client wakes up, which is all
    // a prune measured in days needs.
    touchLastSeen(user.id);

    return reply.send({
      id: user.id,
      username: user.username,
      isAdmin: Boolean(user.is_admin),
      isGuest: user.kind === 'guest',
      hasPasscode: Boolean(user.passcode_hash),
    });
  });

  // Exchanges a session token for a short-lived media token the client can put
  // in a `<audio src>` / `<img src>` URL. Callers should cache it until
  // `expiresAt` rather than minting one per track.
  fastify.post('/auth/media-token', { preHandler: fastify.authenticate }, async (request, reply) => {
    const token = signMediaToken(request.user!);
    return reply.send({ token, expiresAt: new Date(tokenExpiresAt(token)).toISOString() });
  });
};

export default authRoute;
