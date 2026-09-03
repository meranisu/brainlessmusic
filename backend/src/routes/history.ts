import type { FastifyPluginAsync } from 'fastify';
import { countHistoryForUser, listHistoryForUser } from '../db/plays.js';
import { parsePagination } from '../utils/pagination.js';

const historyRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/me/history',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const userId = request.user!.id;
      const history = listHistoryForUser(userId, limit, offset);
      return reply.send({ total: countHistoryForUser(userId), limit, offset, history });
    },
  );
};

export default historyRoute;
