-- Where each listener was, so closing the tab and opening the phone picks up
-- mid-song instead of at the top of the library.
--
-- `user_id` is the PRIMARY KEY, not part of a composite: exactly one row per
-- user, so "last write wins" is enforced by the schema rather than remembered
-- in application code. Per-device state was considered and rejected — the
-- desktop would never learn where the phone got to, which is the whole point.
--
-- The current track is deliberately NOT a column. It is `queue[queue_index]`,
-- and storing it as well would create two places to be right about the same
-- fact — the drift `recordScrobble` uses a transaction to avoid.
--
-- No ON DELETE CASCADE, matching `favorites`: this database does not set
-- `PRAGMA foreign_keys`, so the references are declarative and a cascade would
-- be a comment that looks like behaviour.
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
