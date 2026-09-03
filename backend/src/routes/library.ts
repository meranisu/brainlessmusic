import type { FastifyPluginAsync } from 'fastify';
import { scanLibrary } from '../services/scanner.js';

const libraryRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post('/library/scan', { preHandler: fastify.authenticate }, async (request, reply) => {
    try {
      const summary = await scanLibrary();
      return reply.send(summary);
    } catch (err) {
      request.log.error(err);
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({ error: 'Library scan failed', message });
    }
  });
};

export default libraryRoute;
