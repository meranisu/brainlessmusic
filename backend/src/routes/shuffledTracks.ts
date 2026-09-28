import type { FastifyPluginAsync } from 'fastify';
import { getTrackSummariesByIds } from '../db/browse.js';
import { listPlayableTrackIds } from '../db/shuffledTracks.js';
import { seededShuffle } from '../services/shuffle.js';
import { parsePagination } from '../utils/pagination.js';

/**
 * `GET /browse/shuffled?seed=N&offset=&limit=` — the whole library in a random order fixed by `seed`,
 * a page at a time. A client that wants to hear everything picks a seed, then keeps asking for the
 * next page as its queue runs down; every track appears exactly once per pass. Nothing is stored on
 * the server: the order is re-derived from the seed on each request (one id query and an O(n)
 * shuffle, cheap at personal-library sizes).
 */
const shuffledTracksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { seed?: string; limit?: string; offset?: string } }>(
    '/browse/shuffled',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const seed = Number(request.query.seed);
      if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
        return reply.code(400).send({ error: 'seed must be an integer between 0 and 2147483647' });
      }
      const { limit, offset } = parsePagination(request.query);

      const order = seededShuffle(listPlayableTrackIds(), seed);
      const pageIds = order.slice(offset, offset + limit);

      // getTrackSummariesByIds does not keep the order it was given; put it back.
      const byId = new Map(getTrackSummariesByIds(pageIds).map((track) => [track.id, track]));
      const tracks = pageIds.flatMap((id) => {
        const track = byId.get(id);
        return track ? [track] : [];
      });

      return reply.send({ seed, total: order.length, limit, offset, tracks });
    },
  );
};

export default shuffledTracksRoute;
