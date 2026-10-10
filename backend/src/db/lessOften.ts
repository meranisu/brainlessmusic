import { db } from './connection.js';

/** Idempotent. */
export function markLessOften(userId: number, trackId: number): void {
  db.prepare('INSERT OR IGNORE INTO less_often (user_id, track_id) VALUES (?, ?)').run(userId, trackId);
}

/** Idempotent. */
export function unmarkLessOften(userId: number, trackId: number): void {
  db.prepare('DELETE FROM less_often WHERE user_id = ? AND track_id = ?').run(userId, trackId);
}

/** Returns how many were cleared. */
export function clearLessOften(userId: number): number {
  return db.prepare('DELETE FROM less_often WHERE user_id = ?').run(userId).changes;
}

export function listLessOftenTrackIds(userId: number): number[] {
  return db
    .prepare('SELECT track_id FROM less_often WHERE user_id = ? ORDER BY track_id')
    .all(userId)
    .map((row) => (row as { track_id: number }).track_id);
}

/**
 * Whether a song marked "less often" is in this shuffle pass: about one seed in four, fixed per (seed, track) so every
 * page of one pass agrees.
 */
export function keptThisPass(trackId: number, seed: number): boolean {
  let h = Math.imul(trackId ^ seed, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) % 4 === 0;
}
