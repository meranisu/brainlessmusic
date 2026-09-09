import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { countUsers, findUserById, findUserByUsername, insertUser, setAdmin } from '../db/users.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { signMediaToken, signToken, tokenExpiresAt } from '../services/token.js';

interface Credentials {
  username: string;
  password: string;
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{2,32}$/;
const MIN_PASSWORD_LENGTH = 8;

const authRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * May an anonymous visitor create an account right now? Two ways to be yes:
   * open registration is configured on, or the user table is empty. The empty
   * case is not a policy choice but a deadlock break — admin-only registration
   * plus no admin has no way out.
   *
   * Unauthenticated by design: the signup page has to ask before anyone can
   * log in. It leaks one bit ("can I sign up here"), not worth protecting.
   * `firstAccount` lets the page say what the account will be — the bootstrap
   * account becomes an admin, later self-serve ones do not.
   */
  function isRegistrationOpen(): boolean {
    return config.allowOpenRegistration || countUsers() === 0;
  }

  fastify.get('/auth/registration-status', async (_request, reply) => {
    return reply.send({ open: isRegistrationOpen(), firstAccount: countUsers() === 0 });
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
      preHandler: async (request, reply) => {
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

      if (findUserByUsername(username)) {
        return reply.code(409).send({ error: 'username already taken' });
      }

      // Re-read rather than trusting the preHandler's count: this is what
      // decides whether the new account gets admin, so it must be measured
      // immediately before the insert.
      const isBootstrap = countUsers() === 0;

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
    if (!user || !(await verifyPassword(password, user.password_hash))) {
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

    return reply.send({ id: user.id, username: user.username, isAdmin: Boolean(user.is_admin) });
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
