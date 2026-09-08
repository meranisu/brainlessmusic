import type { FastifyPluginAsync } from 'fastify';
import { findAlbumArtworkId } from '../db/artwork.js';
import { countAlbums, getAlbumDetail, listAlbums } from '../db/browse.js';
import { sendCover } from '../services/artwork.js';
import { parsePagination } from '../utils/pagination.js';

const albumsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/albums',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const albums = listAlbums(limit, offset);
      return reply.send({ total: countAlbums(), limit, offset, albums });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/albums/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Album not found' });
      }

      const album = getAlbumDetail(id);
      if (!album) {
        return reply.code(404).send({ error: 'Album not found' });
      }

      return reply.send(album);
    },
  );

  // `authenticateMedia` so `<img src>` can load it with a scoped `?token=`.
  fastify.get<{ Params: { id: string }; Querystring: { size?: string; token?: string } }>(
    '/albums/:id/cover',
    { preHandler: fastify.authenticateMedia },
    async (request, reply) => {
      const id = Number(request.params.id);
      if (!Number.isInteger(id)) {
        return reply.code(404).send({ error: 'Album not found' });
      }

      return sendCover(request, reply, findAlbumArtworkId(id), request.query.size);
    },
  );
};

export default albumsRoute;
