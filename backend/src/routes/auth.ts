import { timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import {
  countAccounts,
  countGuests,
  findUserById,
  findUserByUsername,
  insertGuest,
  insertUser,
  pruneIdleGuests,
  setAdmin,
  touchLastSeen,
} from '../db/users.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { createRateLimiter } from '../services/rateLimit.js';
import {
  signMediaToken,
  signToken,
  signUnlockTicket,
  tokenExpiresAt,
  verifyUnlockTicket,
} from '../services/token.js';

interface Credentials {
  username: string;
  password: string;
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,32}$/;
const MIN_PASSWORD_LENGTH = 8;

/** Header the browser carries an unlock ticket in — a header, not a body field, so it composes with the credentials shape already in use. */
const UNLOCK_HEADER = 'x-unlock-ticket';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const guestMintLimiter = createRateLimiter();
const unlockLimiter = createRateLimiter();

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
   * Answers the numpad behind the title screen's hidden admin entrance, and
   * returns a ticket `/auth/login` then demands.
   *
   * The code is checked **here** rather than in the browser for the reason the
   * whole mechanism exists: a single-page app ships its route table and every
   * constant in it to everyone, so a code compared in React is a code handed to
   * the people it is hiding from. Hiding `/login` is tidiness; this is the part
   * that refuses.
   *
   * **With no code configured this hands a ticket to anyone who asks**, and
   * that is deliberate. `/auth/login` does not ask for a ticket in that
   * configuration, so the ticket grants nothing that was not already available
   * — and the alternative locks the owner out of a door the UI has just hidden,
   * since the numpad would be the only way to it and could never be satisfied.
   * The cost is one bit ("this server has no admin code"), which anyone learns
   * from a single login attempt anyway. Reversed from the first version of this
   * endpoint, which refused identically in both cases; see the 2026-09-11
   * change-log entry.
   */
  fastify.post<{ Body: { code?: unknown } }>('/auth/unlock', async (request, reply) => {
    const rate = unlockLimiter.check(request.ip, {
      limit: config.unlockAttemptsPerMinute,
      windowMs: MINUTE_MS,
    });

    if (!rate.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(rate.retryAfterSeconds))
        .send({ error: 'Too many attempts — wait a moment' });
    }

    if (config.adminEntryCode !== '' && !secretMatches(request.body?.code, config.adminEntryCode)) {
      return reply.code(401).send({ error: 'That code is not right' });
    }

    // A correct answer clears the failures before it, so a fumbled entry
    // followed by a correct one doesn't eat into the next minute's budget.
    unlockLimiter.clear(request.ip);

    const ticket = signUnlockTicket();
    return reply.send({ ticket, expiresAt: new Date(tokenExpiresAt(ticket)).toISOString() });
  });

  /**
   * Is this request allowed to attempt a password login at all? Only relevant
   * while `ADMIN_ENTRY_CODE` is set; unset, this is transparent and login works
   * exactly as it always has.
   */
  function unlockedForLogin(request: FastifyRequest): boolean {
    if (config.adminEntryCode === '') return true;

    const ticket = request.headers[UNLOCK_HEADER];
    if (typeof ticket !== 'string') return false;

    try {
      verifyUnlockTicket(ticket);
      return true;
    } catch {
      return false;
    }
  }

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
    if (!unlockedForLogin(request)) {
      // Same shape as a wrong password: a distinct "you need the code" reply
      // would confirm the account exists to anyone who found this endpoint.
      return reply.code(401).send({ error: 'invalid username or password' });
    }

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
