import type { FastifyPluginAsync } from 'fastify';
import { getLetterIndex, type LetterScope } from '../db/letterIndex.js';

const SCOPES = new Set<LetterScope>(['tracks', 'albums', 'artists']);

/**
 * `GET /browse/letters?scope=tracks|albums|artists` — where each letter starts in that list, for a
 * client that pages and so cannot count for itself. See `db/letterIndex.ts`.
 */
const lettersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { scope?: string } }>(
    '/browse/letters',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const scope = request.query.scope as LetterScope;
      if (!SCOPES.has(scope)) {
        return reply.code(400).send({ error: 'scope must be one of tracks, albums, artists' });
      }
      return reply.send({ scope, ...getLetterIndex(scope) });
    },
  );
};

export default lettersRoute;
