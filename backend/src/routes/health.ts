import type { FastifyPluginAsync } from 'fastify';
import { countMissingTracks } from '../db/library.js';
import { listRecentPlaybackFailures } from '../db/playbackFailures.js';
import { countScanFailures, listScanFailures } from '../db/scanFailures.js';
import { isAnyLibrarySyncRunning } from '../services/librarySync.js';
import { getHealthSnapshot, listActiveSessions } from '../services/streamMonitor.js';
import { getSystemStats } from '../services/systemStats.js';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Operational data (active streams, recent errors), not identity — any
  // signed-in user can view it, no requireAdmin gate.
  // `missingTracks` is read here rather than inside the monitor so that stays
  // pure in-memory state — the stream path must not depend on a query.
  fastify.get('/admin/health', { preHandler: fastify.authenticate }, async () => ({
    ...getHealthSnapshot(),
    missingTracks: countMissingTracks(),
    librarySyncRunning: isAnyLibrarySyncRunning(),
  }));

  // Unlike `/admin/health` above, this names names — who hit the failure and
  // from what client — so it's admin-gated rather than open to any signed-in
  // user. Backed by the `playback_failures` table (not container stdout) so
  // it survives every rebuild/restart between now and whenever the next
  // report comes in, instead of being lost the moment the container recycles.
  fastify.get<{ Querystring: { limit?: string } }>(
    '/admin/playback-failures',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request) => {
      const limit = Number(request.query.limit);
      return { failures: listRecentPlaybackFailures(Number.isInteger(limit) && limit > 0 ? limit : undefined) };
    },
  );

  // Everything the Control Center shows that `/admin/health` deliberately
  // doesn't: who is listening to what, and the server's own resource use.
  // Admin-gated for the same reason as the playback failures above. Scan
  // *progress* isn't here — `GET /library/roots` already serves it per root.
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
