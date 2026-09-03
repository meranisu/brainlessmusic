import type { FastifyPluginAsync } from 'fastify';
import { countArtists, getArtistDetail, listArtists } from '../db/browse.js';
import { parsePagination } from '../utils/pagination.js';

const artistsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/artists',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const artists = listArtists(limit, offset);
      return reply.send({ total: countArtists(), limit, offset, artists });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/artists/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Artist not found' });
      }

      const artist = getArtistDetail(id);
      if (!artist) {
        return reply.code(404).send({ error: 'Artist not found' });
      }

      return reply.send(artist);
    },
  );
};

export default artistsRoute;
