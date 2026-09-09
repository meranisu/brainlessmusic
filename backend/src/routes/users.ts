import type { FastifyPluginAsync } from 'fastify';
import {
  countAdmins,
  deleteUser,
  findUserById,
  listUsers,
  setAdminById,
  setPasswordHashById,
} from '../db/users.js';
import { hashPassword } from '../services/password.js';

interface UserPatchBody {
  isAdmin?: boolean;
  password?: string;
}

/**
 * Admin user management. Everything here previously required SSH and a CLI
 * script (`npm run set-admin` / `set-password`), which is a poor way to
 * onboard a friend.
 *
 * Account *creation* lives on `POST /auth/register`, not here, so there is one
 * code path that creates a user and one place that decides who may.
 */
const usersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/users', { preHandler: [fastify.authenticate, fastify.requireAdmin] }, async (_request, reply) => {
    return reply.send({ users: listUsers() });
  });

  fastify.patch<{ Params: { id: string }; Body: UserPatchBody }>(
    '/users/:id',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) return reply.code(404).send({ error: 'User not found' });

      const user = findUserById(id);
      if (!user) return reply.code(404).send({ error: 'User not found' });

      const { isAdmin, password } = request.body ?? {};

      if (isAdmin === false && user.is_admin === 1 && countAdmins() <= 1) {
        // Removing the last admin leaves an installation nobody can manage,
        // recoverable only by running the CLI on the server. Refuse rather
        // than let someone lock themselves out from a browser.
        return reply.code(409).send({ error: 'Cannot remove the last admin' });
      }

      if (typeof isAdmin === 'boolean') setAdminById(id, isAdmin);

      if (password !== undefined) {
        if (typeof password !== 'string' || password.length < 8) {
          return reply.code(400).send({ error: 'Password must be at least 8 characters' });
        }
        setPasswordHashById(id, await hashPassword(password));
      }

      const updated = findUserById(id)!;
      return reply.send({
        id: updated.id,
        username: updated.username,
        isAdmin: Boolean(updated.is_admin),
        createdAt: updated.created_at,
      });
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) return reply.code(404).send({ error: 'User not found' });

      const user = findUserById(id);
      if (!user) return reply.code(404).send({ error: 'User not found' });

      if (user.id === request.user!.id) {
        return reply.code(409).send({ error: 'You cannot delete your own account' });
      }

      if (user.is_admin === 1 && countAdmins() <= 1) {
        return reply.code(409).send({ error: 'Cannot delete the last admin' });
      }

      deleteUser(id);
      return reply.code(204).send();
    },
  );
};

export default usersRoute;
