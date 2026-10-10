import { db } from './connection.js';

/** Every track on disk and not hidden (the song list's set), by id so a seed always shuffles the same sequence. */
export function listPlayableTrackIds(): number[] {
  return (
    db.prepare('SELECT id FROM tracks WHERE missing_since IS NULL AND hidden = 0 ORDER BY id').all() as { id: number }[]
  ).map((row) => row.id);
}
