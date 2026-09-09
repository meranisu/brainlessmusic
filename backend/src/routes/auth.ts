import type { FastifyPluginAsync } from 'fastify';
import { countUsers, findUserById, findUserByUsername, insertUser, setAdmin } from '../db/users.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { signMediaToken, signToken, tokenExpiresAt } from '../services/token.js';

interface Credentials {
  username: string;
  password: string;
}

const authRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Registration is admin-only, with one exception: an installation with no
   * users at all lets the first request through and makes that account an
   * admin. Without that bootstrap there would be no way to create the first
   * account — admin-only registration and an empty user table deadlock.
   *
   * Composed by hand rather than as `preHandler: [authenticate, requireAdmin]`
   * because the gate is conditional. `request.user` is the signal that
   * `authenticate` succeeded: when it fails it has already sent a 401, and
   * calling `requireAdmin` afterwards would try to send a second reply.
   */
  fastify.post<{ Body: Credentials }>(
    '/auth/register',
    {
      preHandler: async (request, reply) => {
        if (countUsers() === 0) return;
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
