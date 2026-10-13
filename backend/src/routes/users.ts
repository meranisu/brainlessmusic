import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { getAvatarId, isAvatarInUse } from '../db/profile.js';
import { removeAvatar } from '../services/avatars.js';
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

/** Admin user management, so onboarding a friend needs no SSH. Creating accounts stays on `POST /auth/register`. */
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
        // The last admin can't be removed from a browser; recovery would need the CLI.
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

      const avatarId = getAvatarId(id);
      deleteUser(id);
      // Their profile picture goes too, unless someone else uploaded the same one.
      if (avatarId && !isAvatarInUse(avatarId)) await removeAvatar(config.avatarPath, avatarId);
      return reply.code(204).send();
    },
  );
};

export default usersRoute;
