import type { FastifyPluginAsync } from 'fastify';
import { finishPlay } from '../db/listeningStats.js';
import { countHistoryForUser, listHistoryForUser } from '../db/plays.js';
import { parsePagination } from '../utils/pagination.js';

const historyRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/me/history',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const userId = request.user!.id;
      const history = listHistoryForUser(userId, limit, offset);
      return reply.send({ total: countHistoryForUser(userId), limit, offset, history });
    },
  );

  // A62: how long the play really lasted, sent when the song ends or is skipped. Own plays only.
  fastify.patch<{ Params: { id: string }; Body: { msPlayed?: number } }>(
    '/me/history/:id',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const id = Number(request.params.id);
      const ms = request.body?.msPlayed;
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
        return reply.code(400).send({ error: 'msPlayed must be a non-negative number' });
      }
      if (!Number.isInteger(id) || !finishPlay(request.user!.id, id, Math.floor(ms))) {
        return reply.code(404).send({ error: 'Play not found' });
      }
      return reply.code(204).send();
    },
  );
};

export default historyRoute;
