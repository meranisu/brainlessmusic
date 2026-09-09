import { db } from './connection.js';

/**
 * Cached peaks for a track, or undefined if none have been computed yet.
 *
 * The distinction between "not computed" and "could not be computed" is
 * deliberately not stored: a failure is usually a missing or unreadable file,
 * which is worth retrying after the file is fixed rather than remembering
 * forever.
 */
export function findTrackWaveform(trackId: number): string | undefined {
  const row = db.prepare('SELECT waveform FROM tracks WHERE id = ?').get(trackId) as
    | { waveform: string | null }
    | undefined;

  return row?.waveform ?? undefined;
}

export function setTrackWaveform(trackId: number, waveform: string): void {
  db.prepare('UPDATE tracks SET waveform = ? WHERE id = ?').run(waveform, trackId);
}
