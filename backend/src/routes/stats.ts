import type { FastifyPluginAsync } from 'fastify';
import { getListeningPatterns, getTopGenres, getTrackStat, getUserStats, type StatsRange } from '../db/listeningStats.js';
import { findTrackById } from '../db/library.js';
import { getOnThisDay } from '../db/onThisDay.js';
import { countTopTracks, listTopTracks } from '../db/plays.js';
import { parsePagination } from '../utils/pagination.js';
import { parseId } from '../utils/parseId.js';

const RANGE_ERROR = 'range must be week, month, year or all';
const isRange = (range: string): range is StatsRange => ['week', 'month', 'year', 'all'].includes(range);

const statsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/stats/top-tracks',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const { limit, offset } = parsePagination(request.query);
      const tracks = listTopTracks(limit, offset);
      return reply.send({ total: countTopTracks(), limit, offset, tracks });
    },
  );

  // The signed-in account's own listening (profile, A61). `limit` is per list (top songs, artists, albums).
  fastify.get<{ Querystring: { range?: string; limit?: string } }>(
    '/me/stats',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const range = (request.query.range ?? 'all') as StatsRange;
      if (!isRange(range)) return reply.code(400).send({ error: RANGE_ERROR });
      const { limit } = parsePagination({ limit: request.query.limit ?? '10' });
      const stats = getUserStats(request.user!.id, range, limit);
      if (!stats) return reply.code(404).send({ error: 'User not found' });
      return reply.send({ ...stats, topGenres: getTopGenres(request.user!.id, range, limit) });
    },
  );

  // When the account listens (stats dashboard): by local hour and weekday, a trend, streaks. `tz` is an IANA zone.
  fastify.get<{ Querystring: { range?: string; tz?: string } }>(
    '/me/stats/patterns',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const range = (request.query.range ?? 'month') as StatsRange;
      if (!isRange(range)) return reply.code(400).send({ error: RANGE_ERROR });
      return reply.send(getListeningPatterns(request.user!.id, range, request.query.tz));
    },
  );

  // What the account played on today's local date in earlier years, grouped by year. `tz` is an IANA zone.
  fastify.get<{ Querystring: { tz?: string } }>(
    '/me/on-this-day',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request) => getOnThisDay(request.user!.id, request.query.tz),
  );

  fastify.get<{ Params: { id: string } }>(
    '/me/stats/tracks/:id',
    { preHandler: [fastify.authenticate, fastify.requireAccount] },
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === undefined || !findTrackById(id)) {
        return reply.code(404).send({ error: 'Track not found' });
      }
      return reply.send(getTrackStat(request.user!.id, id));
    },
  );
};

export default statsRoute;
