import type { FastifyPluginAsync } from 'fastify';
import { findUserById, findUserByUsername, insertUser } from '../db/users.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { signToken } from '../services/token.js';

interface Credentials {
  username: string;
  password: string;
}

const authRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: Credentials }>('/auth/register', async (request, reply) => {
    const { username, password } = request.body ?? ({} as Credentials);

    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password are required' });
    }

    if (findUserByUsername(username)) {
      return reply.code(409).send({ error: 'username already taken' });
    }

    const passwordHash = await hashPassword(password);
    const user = insertUser(username, passwordHash);

    return reply.code(201).send({ id: user.id, username: user.username });
  });

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
};

export default authRoute;
