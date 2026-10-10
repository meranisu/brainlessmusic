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
 * Unregisters a root but keeps its tracks (detached, with their favorites and history). The caller marks them
 * missing first. Detach happens before the delete, in one transaction, because foreign keys are enforced.
 */
export function deleteLibraryRoot(id: number): void {
  db.transaction(() => {
    db.prepare('UPDATE tracks SET root_id = NULL WHERE root_id = ?').run(id);
    db.prepare('DELETE FROM scan_failures WHERE root_id = ?').run(id);
    db.prepare('DELETE FROM library_roots WHERE id = ?').run(id);
  })();
}

/** Seeds the original LIBRARY_PATH as a root and adopts older tracks. A no-op once any root exists; SQL can't read env. */
export function ensureDefaultLibraryRoot(libraryPath: string): void {
  if (listLibraryRoots().length > 0) return;

  const root = insertLibraryRoot(libraryPath, 'Library');
  db.prepare('UPDATE tracks SET root_id = ? WHERE root_id IS NULL').run(root.id);
}
