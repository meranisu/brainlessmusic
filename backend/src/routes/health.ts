import type { FastifyPluginAsync } from 'fastify';
import { countMissingTracks } from '../db/library.js';
import { isLibrarySyncRunning } from '../services/librarySync.js';
import { getHealthSnapshot } from '../services/streamMonitor.js';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Operational data (active streams, recent errors), not identity — any
  // signed-in user can view it, no requireAdmin gate.
  // `missingTracks` is read here rather than inside the monitor so that stays
  // pure in-memory state — the stream path must not depend on a query.
  fastify.get('/admin/health', { preHandler: fastify.authenticate }, async () => ({
    ...getHealthSnapshot(),
    missingTracks: countMissingTracks(),
    librarySyncRunning: isLibrarySyncRunning(),
  }));
};

export default healthRoute;
