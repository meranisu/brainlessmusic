import { readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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

/** Above this, a directory's contents are truncated rather than returned in
 *  full — this is a folder picker, not a filesystem export, and a virtual
 *  directory like `/proc` can otherwise hand back thousands of entries. */
const MAX_BROWSE_ENTRIES = 500;

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

  // Lets the Options page's "Browse…" button walk the container's own
  // filesystem instead of asking an admin to already know the exact path —
  // read-only, directories only. Not a new trust boundary: `POST
  // /library/roots` below already accepts and persists any container-
  // readable absolute path with no allowlist, so listing directory *names*
  // under an admin-only gate isn't a bigger exposure than that already is.
  fastify.get<{ Querystring: { path?: string } }>('/library/browse', adminOnly, async (request, reply) => {
    // Always absolute and with `..` collapsed, so a stray relative segment
    // can't produce a confusing path — not a sandbox, just canonicalization.
    const path = resolve('/', request.query.path ?? '/');

    let dirents;
    try {
      dirents = await readdir(path, { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return reply.code(400).send({ error: `"${path}" is not a directory inside the container` });
      }
      if (code === 'EACCES' || code === 'EPERM') {
        return reply.code(400).send({ error: `Permission denied reading "${path}" inside the container` });
      }
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }

    // Files aren't relevant to picking a folder. Symlinks are skipped too —
    // `Dirent.isDirectory()` doesn't follow them, which conveniently also
    // means a self-referential symlink can't turn into an infinite up/down
    // loop in the dialog.
    const directories = dirents
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const truncated = directories.length > MAX_BROWSE_ENTRIES;
    const entries = directories
      .slice(0, MAX_BROWSE_ENTRIES)
      .map((name) => ({ name, path: resolve(path, name) }));

    return reply.send({
      path,
      parent: path === '/' ? null : dirname(path),
      entries,
      ...(truncated ? { truncated: true } : {}),
    });
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

    // A directory is not a music folder just because it's readable — an
    // admin pointing this at the wrong place (a whole drive, a Windows
    // system folder, an empty directory) should be told, not left with a
    // registered root that will only ever be empty. Checked against the
    // scan that already ran rather than walking the tree a second time.
    if (result?.scan && result.scan.filesFound === 0) {
      deleteLibraryRoot(root.id);
      return reply.code(400).send({
        error: `No music files found in "${path}" — nothing was registered.`,
      });
    }

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
