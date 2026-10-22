import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { findAlbumArtworkId } from '../db/artwork.js';
import { countAlbums, getAlbumDetail, listAlbums, resolveAlbumId, type AlbumSort } from '../db/browse.js';
import { sendCover } from '../services/artwork.js';
import { isAdminRequest } from '../utils/isAdmin.js';
import { parsePagination } from '../utils/pagination.js';
import { parseId } from '../utils/parseId.js';

const albumsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string; offset?: string; sort?: string } }>(
    '/albums',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      // Anything but `added` keeps the old title order, as `/tracks` treats an unknown sort.
      const sort: AlbumSort = request.query.sort === 'added' ? 'added' : 'title';
      const albums = listAlbums(limit, offset, sort);
      return reply.send({ total: countAlbums(), limit, offset, albums });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/albums/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === undefined) {
        return reply.code(404).send({ error: 'Album not found' });
      }

      // An album a rescan emptied answers with the one its tracks moved to, so old links and downloads still land.
      const target = resolveAlbumId(id);
      const album = getAlbumDetail(target, isAdminRequest(request));
      if (!album) {
        return reply.code(404).send({ error: 'Album not found' });
      }

      return reply.send(target === id ? album : { ...album, mergedFrom: id });
    },
  );

  // `authenticateMedia` so `<img src>` can load it with a scoped `?token=`.
  fastify.get<{ Params: { id: string }; Querystring: { size?: string; token?: string } }>(
    '/albums/:id/cover',
    { preHandler: fastify.authenticateMedia },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === undefined) {
        return reply.code(404).send({ error: 'Album not found' });
      }

      return sendCover(request, reply, config.artworkPath, findAlbumArtworkId(resolveAlbumId(id)), request.query.size);
    },
  );
};

export default albumsRoute;
