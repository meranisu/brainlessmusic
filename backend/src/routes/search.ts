import type { FastifyPluginAsync } from 'fastify';
import { searchLibrary } from '../db/browse.js';

const searchRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { q?: string } }>(
    '/search',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const q = request.query.q?.trim();
      if (!q) {
        return reply.code(400).send({ error: 'q query parameter is required' });
      }

      return reply.send(searchLibrary(q));
    },
  );
};

export default searchRoute;
