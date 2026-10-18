import type { FastifyPluginAsync } from 'fastify';
import { getGenreDetail, listGenres } from '../db/genres.js';
import { parseId } from '../utils/parseId.js';

const genresRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/genres', { preHandler: fastify.authenticate }, async (_request, reply) => {
    return reply.send({ genres: listGenres() });
  });

  fastify.get<{ Params: { id: string } }>(
    '/genres/:id',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const id = parseId(request.params.id);
      const genre = id !== undefined ? getGenreDetail(id) : undefined;
      if (!genre) {
        return reply.code(404).send({ error: 'Genre not found' });
      }
      return reply.send(genre);
    },
  );
};

export default genresRoute;
