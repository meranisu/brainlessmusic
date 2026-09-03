CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  played_at TEXT NOT NULL DEFAULT (datetime('now')),
  ms_played INTEGER
);

CREATE INDEX IF NOT EXISTS idx_play_history_user_played_at ON play_history(user_id, played_at);
CREATE INDEX IF NOT EXISTS idx_play_history_track_id ON play_history(track_id);

ALTER TABLE tracks ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN last_played_at TEXT;
