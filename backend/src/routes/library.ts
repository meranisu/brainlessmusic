import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { scanLibrary } from '../services/scanner.js';

const libraryRoute: FastifyPluginAsync = async (fastify) => {
  // Admin-only: a scan walks the whole library off disk, so leaving it open to
  // any signed-in account is a free way to hammer the server — which stopped
  // being theoretical when open registration let strangers hold an account.
  fastify.post(
    '/library/scan',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      try {
        const summary = await scanLibrary(config.libraryPath);
        return reply.send(summary);
      } catch (err) {
        request.log.error(err);
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({ error: 'Library scan failed', message });
      }
    },
  );
};

export default libraryRoute;
