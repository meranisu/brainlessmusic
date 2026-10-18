import type { FastifyPluginAsync } from 'fastify';
import { getLetterIndex, type LetterScope } from '../db/letterIndex.js';

const SCOPES = new Set<LetterScope>(['tracks', 'albums', 'artists']);

/**
 * `GET /browse/letters?scope=tracks|albums|artists`: where each letter starts, for a paging client. See `db/letterIndex.ts`.
 * `&missing=all` (tracks) counts songs whose files are missing too, to match a list that shows them (A213).
 */
const lettersRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { scope?: string; missing?: string } }>(
    '/browse/letters',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const scope = request.query.scope as LetterScope;
      if (!SCOPES.has(scope)) {
        return reply.code(400).send({ error: 'scope must be one of tracks, albums, artists' });
      }
      return reply.send({ scope, ...getLetterIndex(scope, { missing: request.query.missing === 'all' ? 'all' : 'exclude' }) });
    },
  );
};

export default lettersRoute;
