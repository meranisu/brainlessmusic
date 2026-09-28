-- A durable record of playback failures, kept in the database rather than
-- only in container stdout — stdout logs vanish on every rebuild/restart,
-- which is exactly the kind of intermittent, hard-to-reproduce bug (a
-- friend's device failing on a track that plays fine for everyone else)
-- this exists to catch. `source` distinguishes the two ways a failure is
-- ever known: 'client' is the player reporting a decode it couldn't finish
-- (see `/tracks/:id/playback-failure`); 'server' is the stream route itself
-- refusing to serve bytes at all (missing file, failed transcode).
--
-- No ON DELETE CASCADE, matching `favorites`/`playback_state`: none of this
-- project's foreign keys cascade, and they ARE enforced (better-sqlite3 turns
-- `foreign_keys` on), so every path that deletes a track or a user has to
-- clear this table's rows first — see `deleteTrackRow`, `pruneIdleGuests`
-- and `deleteUser`.
CREATE TABLE IF NOT EXISTS playback_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  media_error_code INTEGER,
  content_type TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_playback_failures_created_at ON playback_failures(created_at);
CREATE INDEX IF NOT EXISTS idx_playback_failures_user_id ON playback_failures(user_id);
