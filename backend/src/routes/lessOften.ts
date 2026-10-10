import type { FastifyPluginAsync } from 'fastify';
import { clearLessOften, listLessOftenTrackIds, markLessOften, unmarkLessOften } from '../db/lessOften.js';
import { findTrackById } from '../db/library.js';
import { listLessOftenTracks } from '../db/listeningStats.js';
import { parsePagination } from '../utils/pagination.js';

/** Songs an account wants to hear less (A60). Accounts only: guests are listen-only (A37). */
const lessOftenRoute: FastifyPluginAsync = async (fastify) => {
  fastify.put<{ Params: { id: string } }>(
    '/tracks/:id/less-often',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || !findTrackById(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }
      markLessOften(request.user!.id, id);
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/tracks/:id/less-often',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || !findTrackById(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }
      unmarkLessOften(request.user!.id, id);
      return reply.code(204).send();
    },
  );

  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/me/less-often',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const userId = request.user!.id;
      return reply.send({
        total: listLessOftenTrackIds(userId).length,
        limit,
        offset,
        tracks: listLessOftenTracks(userId, limit, offset),
      });
    },
  );

  fastify.get('/me/less-often/ids', { preHandler: [fastify.authenticate, fastify.requireAccount] }, async (request, reply) => {
    return reply.send({ trackIds: listLessOftenTrackIds(request.user!.id) });
  });

  fastify.delete('/me/less-often', { preHandler: [fastify.authenticate, fastify.requireAccount] }, async (request, reply) => {
    return reply.send({ cleared: clearLessOften(request.user!.id) });
  });
};

export default lessOftenRoute;
