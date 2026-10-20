import type { FastifyPluginAsync } from 'fastify';
import { countMissingTracks } from '../db/library.js';
import { summarizeRecentPlays } from '../db/plays.js';
import { countPlaybackFailures, listRecentPlaybackFailures } from '../db/playbackFailures.js';
import { countScanFailures, listScanFailures } from '../db/scanFailures.js';
import { isAnyLibrarySyncRunning } from '../services/librarySync.js';
import { getTrackSummaryById } from '../db/browse.js';
import { listTrackLoudness, summarizeLoudness, type LoudnessStatus } from '../db/loudness.js';
import { getLoudnessWork } from '../services/loudness.js';
import { summarizeFeatures } from '../db/audioFeatures.js';
import { FEATURES_VERSION, getFeaturesWork } from '../services/audioFeatures.js';
import { getHealthSnapshot, listListeners } from '../services/streamMonitor.js';
import { getSystemStats } from '../services/systemStats.js';

const LOUDNESS_STATUSES: LoudnessStatus[] = ['levelled', 'waiting', 'failed'];

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Operational data, open to any signed-in user. `missingTracks` is queried here so the monitor stays pure memory.
  fastify.get('/admin/health', { preHandler: fastify.authenticate }, async () => ({
    ...getHealthSnapshot(),
    missingTracks: countMissingTracks(),
    librarySyncRunning: isAnyLibrarySyncRunning(),
  }));

  // Admin-only: it names who failed and on which client. Stored in `playback_failures`, so it survives restarts.
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/admin/playback-failures',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request) => {
      const limit = Number(request.query.limit);
      const offset = Number(request.query.offset);
      return {
        failures: listRecentPlaybackFailures(
          Number.isInteger(limit) && limit > 0 ? limit : undefined,
          Number.isInteger(offset) && offset > 0 ? offset : 0,
        ),
        total: countPlaybackFailures(),
      };
    },
  );

  // Who is listening to what, and resource use. Admin-only. Scan progress is per root in `GET /library/roots`.
  fastify.get(
    '/admin/control-center',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async () => ({
      system: await getSystemStats(),
      listeners: listListeners(),
      scanFailures: listScanFailures(),
      scanFailureCount: countScanFailures(),
      plays: summarizeRecentPlays(),
      audioFeatures: { ...summarizeFeatures(FEATURES_VERSION), ...getFeaturesWork() },
    }),
  );

  // Which songs volume levelling has reached (owner request): totals, what is being measured now, and a page of tracks.
  fastify.get<{ Querystring: { status?: string; search?: string; limit?: string; offset?: string } }>(
    '/admin/loudness',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      const { status, search } = request.query;
      if (status !== undefined && !LOUDNESS_STATUSES.includes(status as LoudnessStatus)) {
        return reply.code(400).send({ error: 'status must be levelled, waiting or failed' });
      }
      const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(request.query.offset) || 0, 0);

      const work = getLoudnessWork();
      const current = work.currentTrackId !== null ? getTrackSummaryById(work.currentTrackId) : undefined;
      const page = listTrackLoudness({
        status: status as LoudnessStatus | undefined,
        search,
        limit,
        offset,
        failedIds: work.failedIds,
      });

      return {
        summary: summarizeLoudness(work.failedIds),
        running: work.running,
        measuring: current ? { id: current.id, title: current.title, artist: current.artist } : null,
        ...page,
        limit,
        offset,
      };
    },
  );
};

export default healthRoute;
