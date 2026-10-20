-- Audio features for smart auto-mixes (A234, A238): a light ffmpeg pass over a 60 s slice of each track, measured in
-- the background like loudness. One row per measured track. A row is stale, and measured again, when its `version` is
-- older than FEATURES_VERSION in services/audioFeatures.ts or its `file_size` no longer matches the track's.
CREATE TABLE track_features (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  -- The track's file_size when measured, so a replaced file is measured again without the scanner knowing this table.
  file_size INTEGER NOT NULL,
  -- Beats per minute, 60 to 180; NULL when no beat stands out (ambient, speech).
  tempo REAL,
  -- Mean frame RMS, 0 to 1.
  energy REAL NOT NULL,
  -- Spread of frame loudness in dB, 90th minus 10th percentile.
  dynamics REAL NOT NULL,
  -- Zero crossings per sample, a cheap stand-in for spectral brightness.
  brightness REAL NOT NULL,
  analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
