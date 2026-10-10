import { db } from './connection.js';

/** Cached peaks, or undefined. Failures aren't stored, so a fixed file gets retried. */
export function findTrackWaveform(trackId: number): string | undefined {
  const row = db.prepare('SELECT waveform FROM tracks WHERE id = ?').get(trackId) as
    | { waveform: string | null }
    | undefined;

  return row?.waveform ?? undefined;
}

export function setTrackWaveform(trackId: number, waveform: string): void {
  db.prepare('UPDATE tracks SET waveform = ? WHERE id = ?').run(waveform, trackId);
}
