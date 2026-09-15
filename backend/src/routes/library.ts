import { stat } from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import { listMissingTracks, listTrackPaths, markTracksMissing } from '../db/library.js';
import {
  countTracksForRoot,
  deleteLibraryRoot,
  findLibraryRootById,
  findLibraryRootByPath,
  insertLibraryRoot,
  listLibraryRoots,
} from '../db/libraryRoots.js';
import { isLibrarySyncRunning, syncLibrary } from '../services/librarySync.js';

interface AddRootBody {
  path: string;
  label?: string;
}

const libraryRoute: FastifyPluginAsync = async (fastify) => {
  // Every route here is admin-only: scanning walks a folder off disk and
  // registering a root exposes whatever's readable inside the container, so
  // leaving either open to any signed-in account is a free way to hammer the
  // server or go fishing for paths — which stopped being theoretical when
  // open registration let strangers hold an account.
  const adminOnly = { preHandler: [fastify.authenticate, fastify.requireAdmin] };

  fastify.get('/library/roots', adminOnly, async (_request, reply) => {
    const roots = listLibraryRoots().map((root) => ({
      id: root.id,
      path: root.path,
      label: root.label,
      addedAt: root.added_at,
      lastScannedAt: root.last_scanned_at,
      // Not the DB row's own `last_scan_error` alone: a root can be fine but
      // simply never scanned yet (a fresh add still in flight).
      status: root.last_scan_error ? ('unreachable' as const) : ('ok' as const),
      trackCount: countTracksForRoot(root.id),
      scanning: isLibrarySyncRunning(root.id),
    }));
    return reply.send({ roots });
  });

  fastify.post<{ Body: AddRootBody }>('/library/roots', adminOnly, async (request, reply) => {
    const path = request.body?.path?.trim();
    const label = request.body?.label?.trim() || null;

    if (!path) {
      return reply.code(400).send({ error: 'path is required' });
    }
    if (findLibraryRootByPath(path)) {
      return reply.code(409).send({ error: 'This folder is already registered' });
    }

    // Checked here, not left to the scan to discover, so "the drive isn't
    // mounted into the container yet" comes back as a clear message rather
    // than a root that's silently registered and forever empty.
    try {
      const stats = await stat(path);
      if (!stats.isDirectory()) {
        return reply.code(400).send({ error: `"${path}" is not a directory` });
      }
    } catch {
      return reply.code(400).send({
        error:
          `Cannot read "${path}" inside the container. If this is a drive that isn't ` +
          `mounted yet, it needs a volume added to docker-compose.yml and a restart first.`,
      });
    }

    const root = insertLibraryRoot(path, label);
    const result = await syncLibrary(root.path, root.id, { scan: true });

    return reply.code(201).send({
      root: { id: root.id, path: root.path, label: root.label },
      scan: result?.scan,
      reconcile: result?.reconcile,
    });
  });

  fastify.post<{ Params: { id: string } }>('/library/roots/:id/scan', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    const root = findLibraryRootById(id);
    if (!Number.isInteger(id) || !root) {
      return reply.code(404).send({ error: 'Library root not found' });
    }

    const result = await syncLibrary(root.path, root.id, { scan: true });
    if (!result) {
      return reply.code(409).send({ error: 'A scan of this root is already in progress' });
    }
    return reply.send({ scan: result.scan, reconcile: result.reconcile });
  });

  fastify.delete<{ Params: { id: string } }>('/library/roots/:id', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    const root = findLibraryRootById(id);
    if (!Number.isInteger(id) || !root) {
      return reply.code(404).send({ error: 'Library root not found' });
    }

    // Marked missing before the root is detached — once `deleteLibraryRoot`
    // clears `root_id`, there is no way left to ask "which tracks were these".
    const ids = listTrackPaths(id).map((row) => row.id);
    markTracksMissing(ids, new Date().toISOString());
    deleteLibraryRoot(id);

    return reply.code(204).send();
  });

  // Scans every registered root in sequence. Kept as one call rather than
  // making the frontend loop over `GET /library/roots` and fire N requests —
  // "scan everything" is the common case (the empty-library arcade screen,
  // the scheduled sweep) and this is also exactly what the schedule itself
  // already does per-tick.
  fastify.post('/library/scan', adminOnly, async (request, reply) => {
    try {
      const roots = listLibraryRoots();
      const results = [];
      for (const root of roots) {
        const result = await syncLibrary(root.path, root.id, { scan: true });
        results.push({ rootId: root.id, label: root.label, scan: result?.scan, reconcile: result?.reconcile });
      }
      return reply.send({ roots: results });
    } catch (err) {
      request.log.error(err);
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({ error: 'Library scan failed', message });
    }
  });

  // The worklist for drift: rows whose file is gone. Flagged by the scheduled
  // sweep, never deleted by it — removing one is a per-track decision, made
  // through `DELETE /tracks/:id`.
  fastify.get('/library/missing', adminOnly, async (_request, reply) => {
    const tracks = listMissingTracks();
    return reply.send({ total: tracks.length, tracks });
  });
};

export default libraryRoute;
