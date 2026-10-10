import type { FastifyPluginAsync } from 'fastify';
import { countMissingTracks } from '../db/library.js';
import { listRecentPlaybackFailures } from '../db/playbackFailures.js';
import { countScanFailures, listScanFailures } from '../db/scanFailures.js';
import { isAnyLibrarySyncRunning } from '../services/librarySync.js';
import { getHealthSnapshot, listActiveSessions } from '../services/streamMonitor.js';
import { getSystemStats } from '../services/systemStats.js';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Operational data, open to any signed-in user. `missingTracks` is queried here so the monitor stays pure memory.
  fastify.get('/admin/health', { preHandler: fastify.authenticate }, async () => ({
    ...getHealthSnapshot(),
    missingTracks: countMissingTracks(),
    librarySyncRunning: isAnyLibrarySyncRunning(),
  }));

  // Admin-only: it names who failed and on which client. Stored in `playback_failures`, so it survives restarts.
  fastify.get<{ Querystring: { limit?: string } }>(
    '/admin/playback-failures',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request) => {
      const limit = Number(request.query.limit);
      return { failures: listRecentPlaybackFailures(Number.isInteger(limit) && limit > 0 ? limit : undefined) };
    },
  );

  // Who is listening to what, and resource use. Admin-only. Scan progress is per root in `GET /library/roots`.
  fastify.get(
    '/admin/control-center',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async () => ({
      system: await getSystemStats(),
      activeSessions: listActiveSessions(),
      scanFailures: listScanFailures(),
      scanFailureCount: countScanFailures(),
    }),
  );
};

export default healthRoute;
