import type { FastifyPluginAsync } from 'fastify';
import { searchLibrary } from '../db/browse.js';
import { searchPlaylists } from '../db/playlists.js';
import { searchPeople } from '../db/profile.js';
import { isAdminRequest } from '../utils/isAdmin.js';

const searchRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { q?: string } }>(
    '/search',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const q = request.query.q?.trim();
      if (!q) {
        return reply.code(400).send({ error: 'q query parameter is required' });
      }

      // Playlists too: the caller's own and everyone's public ones (A162). And people, to reach a profile (A172).
      return reply.send({
        ...searchLibrary(q, isAdminRequest(request)),
        playlists: searchPlaylists(q, request.user!.id),
        people: searchPeople(q),
      });
    },
  );
};

export default searchRoute;
