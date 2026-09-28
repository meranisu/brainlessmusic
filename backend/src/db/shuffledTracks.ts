import { db } from './connection.js';

/**
 * Ids of every track a listener can be given: on disk and not hidden — the same default the plain
 * track list shows, so "shuffle everything" and "the songs list" mean the same set. Ordered by id so
 * that a seed always shuffles the same starting sequence.
 */
export function listPlayableTrackIds(): number[] {
  return (
    db.prepare('SELECT id FROM tracks WHERE missing_since IS NULL AND hidden = 0 ORDER BY id').all() as { id: number }[]
  ).map((row) => row.id);
}
