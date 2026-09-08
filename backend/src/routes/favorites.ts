import type { FastifyPluginAsync } from 'fastify';
import {
  countFavoritesForUser,
  listFavoriteTrackIdsForUser,
  listFavoritesForUser,
  starTrack,
  unstarTrack,
} from '../db/favorites.js';
import { findTrackById } from '../db/library.js';
import { parsePagination } from '../utils/pagination.js';

const favoritesRoute: FastifyPluginAsync = async (fastify) => {
  fastify.put<{ Params: { id: string } }>(
    '/tracks/:id/favorite',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || !findTrackById(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      starTrack(request.user!.id, id);
      return reply.code(204).send();
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/tracks/:id/favorite',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id) || !findTrackById(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }

      unstarTrack(request.user!.id, id);
      return reply.code(204).send();
    },
  );

  // Registered before '/me/favorites' for readability; Fastify routes on the
  // full path either way.
  fastify.get('/me/favorites/ids', { preHandler: fastify.authenticate }, async (request, reply) => {
    return reply.send({ trackIds: listFavoriteTrackIdsForUser(request.user!.id) });
  });

  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/me/favorites',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const userId = request.user!.id;
      const favorites = listFavoritesForUser(userId, limit, offset);
      return reply.send({ total: countFavoritesForUser(userId), limit, offset, favorites });
    },
  );
};

export default favoritesRoute;
