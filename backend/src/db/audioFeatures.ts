import { db } from './connection.js';

export interface AudioFeatures {
  tempo: number | null;
  energy: number;
  dynamics: number;
  brightness: number;
}

export interface TrackFeaturesRow extends AudioFeatures {
  trackId: number;
}

/**
 * Tracks with no current features, leaving out those that just failed. A row counts as current only at `version` and
 * the track's present file size. Most recently played first, like loudness, so radios work for played songs early.
 */
export function findUnanalyzedTrackIds(version: number, limit: number, skip: ReadonlySet<number>): number[] {
  const rows = db
    .prepare(
      `SELECT t.id FROM tracks t
       LEFT JOIN track_features f ON f.track_id = t.id AND f.version = ? AND f.file_size = t.file_size
       WHERE f.track_id IS NULL AND t.missing_since IS NULL
       ORDER BY t.last_played_at IS NULL, t.last_played_at DESC, t.id
       LIMIT ?`,
    )
    .all(version, limit + skip.size) as Array<{ id: number }>;

  return rows.map((row) => row.id).filter((id) => !skip.has(id)).slice(0, limit);
}

export function hasCurrentFeatures(trackId: number, version: number): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM track_features f JOIN tracks t ON t.id = f.track_id
         WHERE f.track_id = ? AND f.version = ? AND f.file_size = t.file_size`,
      )
      .get(trackId, version) !== undefined
  );
}

export function setTrackFeatures(trackId: number, version: number, fileSize: number, features: AudioFeatures): void {
  db.prepare(
    `INSERT INTO track_features (track_id, version, file_size, tempo, energy, dynamics, brightness)
     VALUES (@trackId, @version, @fileSize, @tempo, @energy, @dynamics, @brightness)
     ON CONFLICT(track_id) DO UPDATE SET version = excluded.version, file_size = excluded.file_size,
       tempo = excluded.tempo, energy = excluded.energy, dynamics = excluded.dynamics,
       brightness = excluded.brightness, analyzed_at = datetime('now')`,
  ).run({ trackId, version, fileSize, ...features });
}

/** Current features for the given tracks; tracks without them are left out. */
export function getTrackFeatures(trackIds: readonly number[], version: number): Map<number, AudioFeatures> {
  const rows = db
    .prepare(
      `SELECT f.track_id as trackId, f.tempo, f.energy, f.dynamics, f.brightness
       FROM track_features f JOIN tracks t ON t.id = f.track_id
       WHERE f.track_id IN (SELECT value FROM json_each(?)) AND f.version = ? AND f.file_size = t.file_size`,
    )
    .all(JSON.stringify(trackIds), version) as TrackFeaturesRow[];

  return new Map(rows.map(({ trackId, ...features }) => [trackId, features]));
}

/** Library-wide mean and spread of each feature, for turning raw values into comparable z-scores. */
export interface FeatureStats {
  mean: AudioFeatures & { tempo: number };
  sd: AudioFeatures & { tempo: number };
}

export function getFeatureStats(version: number): FeatureStats | null {
  const row = db
    .prepare(
      `SELECT COUNT(*) as n,
              AVG(tempo) as tempo, AVG(energy) as energy, AVG(dynamics) as dynamics, AVG(brightness) as brightness,
              AVG(tempo * tempo) as tempo2, AVG(energy * energy) as energy2,
              AVG(dynamics * dynamics) as dynamics2, AVG(brightness * brightness) as brightness2
       FROM track_features WHERE version = ?`,
    )
    .get(version) as Record<string, number | null> & { n: number };
  if (row.n < 2) return null;

  const sd = (mean: number | null, square: number | null) =>
    mean === null || square === null ? 1 : Math.sqrt(Math.max(square - mean * mean, 0)) || 1;
  return {
    mean: { tempo: row.tempo ?? 0, energy: row.energy ?? 0, dynamics: row.dynamics ?? 0, brightness: row.brightness ?? 0 },
    sd: {
      tempo: sd(row.tempo, row.tempo2),
      energy: sd(row.energy, row.energy2),
      dynamics: sd(row.dynamics, row.dynamics2),
      brightness: sd(row.brightness, row.brightness2),
    },
  };
}

export interface FeaturesSummary {
  total: number;
  analyzed: number;
}

export function summarizeFeatures(version: number): FeaturesSummary {
  return db
    .prepare(
      `SELECT COUNT(*) as total, COUNT(f.track_id) as analyzed
       FROM tracks t
       LEFT JOIN track_features f ON f.track_id = t.id AND f.version = ? AND f.file_size = t.file_size
       WHERE t.missing_since IS NULL`,
    )
    .get(version) as FeaturesSummary;
}
