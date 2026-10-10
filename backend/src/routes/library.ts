import { readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { listMissingTracks } from '../db/library.js';
import { getLibraryStats } from '../db/libraryStats.js';
import {
  countTracksForRoot,
  deleteLibraryRoot,
  findLibraryRootById,
  insertLibraryRoot,
  listLibraryRoots,
} from '../db/libraryRoots.js';
import { findUserById } from '../db/users.js';
import { getScanProgress, isLibrarySyncRunning, syncLibrary } from '../services/librarySync.js';

interface AddRootBody {
  path: string;
  label?: string;
}

/** Listings past this are truncated; virtual folders like `/proc` can return thousands of entries. */
const MAX_BROWSE_ENTRIES = 500;

/** Whether one folder is the other or inside it. Both must already be `resolve()`d. */
function overlaps(a: string, b: string): boolean {
  const inside = (child: string, parent: string) => {
    const rel = relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  };
  return inside(a, b) || inside(b, a);
}

const libraryRoute: FastifyPluginAsync = async (fastify) => {
  // Admin-only: scanning loads the disk and registering a root exposes the container's files.
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
      // `null` means not scanning, or still in the initial walk before a file count exists.
      scanProgress: getScanProgress(root.id),
    }));
    return reply.send({ roots });
  });

  // Read-only folder listing for "Browse…". No new exposure: `POST /library/roots` already accepts any readable path.
  fastify.get<{ Querystring: { path?: string } }>('/library/browse', adminOnly, async (request, reply) => {
    // Canonicalized to an absolute path; not a sandbox.
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

    // Directories only. `isDirectory()` doesn't follow symlinks, so a self-referential link can't loop the dialog.
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
    const rawPath = request.body?.path?.trim();
    const label = request.body?.label?.trim() || null;

    if (!rawPath) {
      return reply.code(400).send({ error: 'path is required' });
    }
    // Resolved, so `/music/` can't pass as a second `/music`: the scan would move every track onto the new root, and
    // removing either one would then delete them all with everyone's favorites and history (A51).
    const path = resolve(rawPath);
    const clash = listLibraryRoots().find((root) => overlaps(resolve(root.path), path));
    if (clash) {
      return reply.code(409).send({
        error:
          resolve(clash.path) === path
            ? 'This folder is already registered'
            : `This folder overlaps "${clash.path}", which is already registered`,
      });
    }

    // Checked up front, so an unmounted drive gets a clear message instead of a forever-empty root.
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

    // A readable folder with no music (a whole drive, an empty dir) is refused, judged from the scan that just ran.
    if (result?.scan && result.scan.filesFound === 0) {
      deleteLibraryRoot(root.id);
      return reply.code(400).send({
        error: `No music files found in "${path}", so nothing was registered.`,
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

    // A scan still running would go on writing tracks under a root id that no longer exists.
    if (isLibrarySyncRunning(id)) {
      return reply.code(409).send({ error: 'This folder is being scanned; remove it when the scan ends' });
    }

    // Deletes the root's tracks from the database too (A51); the files stay on disk.
    deleteLibraryRoot(id);

    return reply.code(204).send();
  });

  // Scans every root in sequence, as the empty-library screen and the schedule need.
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

  // Tracks whose file is gone. Flagged, never deleted; deletion is per track via `DELETE /tracks/:id`.
  // Any signed-in user, guests too: the Full view shows it to everyone (A34). Hidden tracks count only for an admin.
  fastify.get('/library/stats', { preHandler: fastify.authenticate }, async (request, reply) => {
    const isAdmin = Boolean(findUserById(request.user!.id)?.is_admin);
    return reply.send(getLibraryStats({ includeHidden: isAdmin }));
  });

  fastify.get('/library/missing', adminOnly, async (_request, reply) => {
    const tracks = listMissingTracks();
    return reply.send({ total: tracks.length, tracks });
  });
};

export default libraryRoute;
