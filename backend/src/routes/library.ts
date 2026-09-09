import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { listMissingTracks } from '../db/library.js';
import { syncLibrary } from '../services/librarySync.js';

const libraryRoute: FastifyPluginAsync = async (fastify) => {
  // Admin-only: a scan walks the whole library off disk, so leaving it open to
  // any signed-in account is a free way to hammer the server — which stopped
  // being theoretical when open registration let strangers hold an account.
  fastify.post(
    '/library/scan',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (request, reply) => {
      try {
        const result = await syncLibrary(config.libraryPath, { scan: true });

        // Turned away rather than queued: a scan already walking this library
        // is about to answer the same question, and two of them upserting the
        // same paths is worse than waiting.
        if (!result) {
          return reply
            .code(409)
            .send({ error: 'A library scan is already in progress' });
        }

        // The scan summary stays the top-level shape it has always been, so
        // existing callers keep working; reconciliation rides alongside it.
        return reply.send({ ...result.scan, reconcile: result.reconcile });
      } catch (err) {
        request.log.error(err);
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({ error: 'Library scan failed', message });
      }
    },
  );

  // The worklist for drift: rows whose file is gone. Flagged by the scheduled
  // sweep, never deleted by it — removing one is a per-track decision, made
  // through `DELETE /tracks/:id`.
  fastify.get(
    '/library/missing',
    { preHandler: [fastify.authenticate, fastify.requireAdmin] },
    async (_request, reply) => {
      const tracks = listMissingTracks();
      return reply.send({
        total: tracks.length,
        libraryPath: config.libraryPath,
        tracks,
      });
    },
  );
};

export default libraryRoute;
