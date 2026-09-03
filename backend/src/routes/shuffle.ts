import type { FastifyPluginAsync } from 'fastify';
import { getTrackSummariesByIds } from '../db/browse.js';
import { findTracksByIds } from '../db/library.js';
import { smartShuffle } from '../services/shuffle.js';

const shuffleRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { trackIds?: number[] } }>(
    '/shuffle',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const trackIds = request.body?.trackIds;
      if (!Array.isArray(trackIds) || trackIds.length === 0 || trackIds.some((t) => !Number.isInteger(t))) {
        return reply.code(400).send({ error: 'trackIds must be a non-empty array of track ids' });
      }

      const found = findTracksByIds(trackIds);
      if (found.length !== trackIds.length) {
        const foundIds = new Set(found.map((t) => t.id));
        const missing = trackIds.filter((id) => !foundIds.has(id));
        return reply.code(404).send({ error: 'One or more tracks not found', missing });
      }

      const order = smartShuffle(found.map((t) => ({ trackId: t.id, artistId: t.artist_id })));

      const summaries = getTrackSummariesByIds(order);
      const summaryById = new Map(summaries.map((s) => [s.id, s]));
      const tracks = order.map((id) => summaryById.get(id)!);

      return reply.send({ tracks });
    },
  );
};

export default shuffleRoute;
