import { db } from './connection.js';

export interface ScanFailureInput {
  path: string;
  error: string;
}

export interface ScanFailureEntry {
  id: number;
  rootId: number;
  rootLabel: string | null;
  rootPath: string;
  path: string;
  message: string;
  createdAt: string;
}

/** Replaces a root's failures with its latest scan's, so fixed files drop off and repeat failures don't pile up. */
export function replaceScanFailures(rootId: number, failures: ScanFailureInput[]): void {
  db.transaction(() => {
    db.prepare('DELETE FROM scan_failures WHERE root_id = ?').run(rootId);
    const insert = db.prepare('INSERT INTO scan_failures (root_id, path, message) VALUES (?, ?, ?)');
    for (const failure of failures) insert.run(rootId, failure.path, failure.error);
  })();
}

export function countScanFailures(): number {
  return (db.prepare('SELECT COUNT(*) as count FROM scan_failures').get() as { count: number }).count;
}

const DEFAULT_LIMIT = 200;

export function listScanFailures(limit = DEFAULT_LIMIT): ScanFailureEntry[] {
  return db
    .prepare(
      `SELECT
         sf.id AS id,
         sf.root_id AS rootId,
         r.label AS rootLabel,
         r.path AS rootPath,
         sf.path AS path,
         sf.message AS message,
         sf.created_at AS createdAt
       FROM scan_failures sf
       JOIN library_roots r ON r.id = sf.root_id
       ORDER BY sf.id DESC
       LIMIT ?`,
    )
    .all(limit) as ScanFailureEntry[];
}
