import { db } from './connection.js';

export interface LibraryRootRow {
  id: number;
  path: string;
  label: string | null;
  added_at: string;
  last_scanned_at: string | null;
  last_scan_error: string | null;
}

export function listLibraryRoots(): LibraryRootRow[] {
  return db.prepare('SELECT * FROM library_roots ORDER BY id').all() as LibraryRootRow[];
}

export function findLibraryRootById(id: number): LibraryRootRow | undefined {
  return db.prepare('SELECT * FROM library_roots WHERE id = ?').get(id) as
    | LibraryRootRow
    | undefined;
}

export function findLibraryRootByPath(path: string): LibraryRootRow | undefined {
  return db.prepare('SELECT * FROM library_roots WHERE path = ?').get(path) as
    | LibraryRootRow
    | undefined;
}

export function insertLibraryRoot(path: string, label: string | null): LibraryRootRow {
  const result = db
    .prepare('INSERT INTO library_roots (path, label) VALUES (?, ?)')
    .run(path, label);
  return findLibraryRootById(Number(result.lastInsertRowid))!;
}

export function recordLibraryRootScan(id: number, error: string | null): void {
  db.prepare(
    'UPDATE library_roots SET last_scanned_at = datetime(\'now\'), last_scan_error = ? WHERE id = ?',
  ).run(error, id);
}

export function countTracksForRoot(id: number): number {
  return (
    db.prepare('SELECT COUNT(*) as count FROM tracks WHERE root_id = ?').get(id) as {
      count: number;
    }
  ).count;
}

/**
 * Removing a root's *registration* is not a decision to destroy its music —
 * the tracks stay (favorites, playlists and history with them), just
 * detached from a root that no longer exists. Nothing here marks them
 * missing; the caller does that first, while `root_id` still says which
 * tracks those are (see `routes/library.ts`).
 *
 * The detach has to happen before the delete, in the same transaction:
 * foreign keys are enforced here (SQLite's own default is off, but
 * better-sqlite3's bundled build enables it), so deleting a root row while
 * tracks still reference it would fail outright rather than leave anything
 * dangling.
 */
export function deleteLibraryRoot(id: number): void {
  db.transaction(() => {
    db.prepare('UPDATE tracks SET root_id = NULL WHERE root_id = ?').run(id);
    db.prepare('DELETE FROM library_roots WHERE id = ?').run(id);
  })();
}

/**
 * Seeds `library_roots` with the app's original single folder, and adopts
 * every track that predates this table into it. Safe to call on every boot —
 * a no-op once the table has any row at all — because a migration (pure SQL,
 * no env var access) can't do this seeding itself.
 */
export function ensureDefaultLibraryRoot(libraryPath: string): void {
  if (listLibraryRoots().length > 0) return;

  const root = insertLibraryRoot(libraryPath, 'Library');
  db.prepare('UPDATE tracks SET root_id = ? WHERE root_id IS NULL').run(root.id);
}
