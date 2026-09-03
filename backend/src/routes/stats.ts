import type { FastifyPluginAsync } from 'fastify';
import { countTopTracks, listTopTracks } from '../db/plays.js';
import { parsePagination } from '../utils/pagination.js';

const statsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/stats/top-tracks',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const tracks = listTopTracks(limit, offset);
      return reply.send({ total: countTopTracks(), limit, offset, tracks });
    },
  );
};

export default statsRoute;
