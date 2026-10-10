-- Where each listener was, for resume. One row per user (`user_id` is the key), so the last write wins.
-- The current track is `queue[queue_index]`, not its own column. No cascade: none of the schema's FKs cascade.
CREATE TABLE IF NOT EXISTS playback_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  -- JSON array of track ids, in play order. Ids rather than rows, so a
  -- retitled or re-tagged track resumes with its current metadata.
  queue TEXT NOT NULL,
  queue_index INTEGER NOT NULL,
  -- Seconds into the current track. REAL because the player's clock is
  -- fractional and rounding to whole seconds is an audible skip backwards.
  position_seconds REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
