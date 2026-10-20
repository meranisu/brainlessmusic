import type { FastifyPluginAsync } from 'fastify';
import { getTrackSummariesByIds, type TrackSummary } from '../db/browse.js';
import { buildRadio, getDailyMixes } from '../services/mix.js';

/** Ids a refill may pass as already queued. A queue past this has long left the seed behind anyway. */
const MAX_EXCLUDE = 1000;
const DEFAULT_RADIO_LIMIT = 50;
const MAX_RADIO_LIMIT = 100;

/** Summaries in the order given; `getTrackSummariesByIds` does not keep it. */
function inOrder(ids: number[]): TrackSummary[] {
  const byId = new Map(getTrackSummariesByIds(ids).map((track) => [track.id, track]));
  return ids.flatMap((id) => {
    const track = byId.get(id);
    return track ? [track] : [];
  });
}

/** Smart auto-mixes (A234): a radio from any song, and each user's daily mixes. */
const mixRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * `GET /mix/radio?seedTrackId=&seed=&exclude=1,2,3&limit=`: songs like the seed song. A refill passes the same
   * `seed` and every id already queued in `exclude`, so it never repeats one. An empty list means the radio ran dry.
   */
  fastify.get<{ Querystring: { seedTrackId?: string; seed?: string; exclude?: string; limit?: string } }>(
    '/mix/radio',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const seedTrackId = Number(request.query.seedTrackId);
      if (!Number.isInteger(seedTrackId) || seedTrackId <= 0) {
        return reply.code(400).send({ error: 'seedTrackId must be a positive integer' });
      }
      const rawSeed = request.query.seed;
      const seed = rawSeed === undefined ? Math.floor(Math.random() * 2147483647) : Number(rawSeed);
      if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
        return reply.code(400).send({ error: 'seed must be an integer between 0 and 2147483647' });
      }
      const exclude = (request.query.exclude ?? '')
        .split(',')
        .filter((part) => part.trim() !== '')
        .map(Number);
      if (exclude.length > MAX_EXCLUDE || exclude.some((id) => !Number.isInteger(id) || id <= 0)) {
        return reply.code(400).send({ error: `exclude must be up to ${MAX_EXCLUDE} comma-separated track ids` });
      }
      const rawLimit = Number(request.query.limit);
      const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_RADIO_LIMIT) : DEFAULT_RADIO_LIMIT;

      const ids = buildRadio({ seedTrackId, userId: request.user!.id, seed, exclude, limit });
      if (!ids) return reply.code(404).send({ error: 'Track not found' });
      return { seedTrackId, seed, tracks: inOrder(ids) };
    },
  );

  /** `GET /mix/daily`: up to six mixes from this user's top genres of the last 30 days, the same all day (A236). */
  fastify.get('/mix/daily', { preHandler: [fastify.authenticate, fastify.requireAccount] }, async (request) => ({
    mixes: getDailyMixes(request.user!.id).map((mix) => ({ id: mix.id, name: mix.name, tracks: inOrder(mix.trackIds) })),
  }));
};

export default mixRoute;
