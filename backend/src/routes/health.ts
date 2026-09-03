import type { FastifyPluginAsync } from 'fastify';
import { getHealthSnapshot } from '../services/streamMonitor.js';

const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Operational data (active streams, recent errors), not identity — any
  // signed-in user can view it, no requireAdmin gate.
  fastify.get('/admin/health', { preHandler: fastify.authenticate }, async () => getHealthSnapshot());
};

export default healthRoute;
