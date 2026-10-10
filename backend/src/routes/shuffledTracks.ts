import type { FastifyPluginAsync } from 'fastify';
import { getTrackSummariesByIds } from '../db/browse.js';
import { keptThisPass, listLessOftenTrackIds } from '../db/lessOften.js';
import { lastPlayedByUser, listPlayableAlbumPlaces, listPlayableTrackIds } from '../db/shuffledTracks.js';
import { rediscoverWeight, seededAlbumOrder, seededShuffle, seededWeightedOrder } from '../services/shuffle.js';
import { parsePagination } from '../utils/pagination.js';

const MODES = ['shuffle', 'rediscover', 'albums'] as const;
type Mode = (typeof MODES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** SQLite's `datetime('now')` shape, which `play_history.played_at` is stored in. */
function toSqliteUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * `GET /browse/shuffled?seed=N&mode=&asOf=&offset=&limit=`: the library in an order fixed by `seed`, re-derived per
 * request. Songs this user marked "less often" are in about one pass (seed) in four.
 *
 * `mode`: `shuffle` (default) is plain random; `rediscover` puts songs this user has not played for a long time, or
 * ever, toward the front; `albums` plays random albums, each in track order. `asOf` (Unix seconds, default now) is
 * when a rediscover pass started: plays after it are ignored, so a song played mid-pass does not move between pages.
 */
const shuffledTracksRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { seed?: string; mode?: string; asOf?: string; limit?: string; offset?: string } }>(
    '/browse/shuffled',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const seed = Number(request.query.seed);
      if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
        return reply.code(400).send({ error: 'seed must be an integer between 0 and 2147483647' });
      }
      const mode = (request.query.mode ?? 'shuffle') as Mode;
      if (!MODES.includes(mode)) {
        return reply.code(400).send({ error: `mode must be one of ${MODES.join(', ')}` });
      }
      const asOfSec = request.query.asOf === undefined ? Date.now() / 1000 : Number(request.query.asOf);
      if (!Number.isFinite(asOfSec) || asOfSec < 0) {
        return reply.code(400).send({ error: 'asOf must be a Unix time in seconds' });
      }
      const { limit, offset } = parsePagination(request.query);

      const userId = request.user!.id;
      const lessOften = new Set(listLessOftenTrackIds(userId));
      const inThisPass = (id: number) => !lessOften.has(id) || keptThisPass(id, seed);

      let order: number[];
      if (mode === 'albums') {
        order = seededAlbumOrder(listPlayableAlbumPlaces().filter((track) => inThisPass(track.id)), seed);
      } else if (mode === 'rediscover') {
        const asOfMs = Math.floor(asOfSec) * 1000;
        const lastPlayed = lastPlayedByUser(userId, toSqliteUtc(asOfMs));
        const daysAgo = (id: number) => {
          const at = lastPlayed.get(id);
          return at === undefined ? null : (asOfMs - Date.parse(`${at.replace(' ', 'T')}Z`)) / DAY_MS;
        };
        order = seededWeightedOrder(listPlayableTrackIds().filter(inThisPass), (id) => rediscoverWeight(daysAgo(id)), seed);
      } else {
        order = seededShuffle(listPlayableTrackIds().filter(inThisPass), seed);
      }
      const pageIds = order.slice(offset, offset + limit);

      // getTrackSummariesByIds does not keep the order it was given; put it back.
      const byId = new Map(getTrackSummariesByIds(pageIds).map((track) => [track.id, track]));
      const tracks = pageIds.flatMap((id) => {
        const track = byId.get(id);
        return track ? [track] : [];
      });

      return reply.send({ seed, mode, total: order.length, limit, offset, tracks });
    },
  );
};

export default shuffledTracksRoute;
