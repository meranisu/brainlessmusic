-- Playback failures, kept because container stdout is lost on restart. 'client' = the player couldn't decode;
-- 'server' = the stream route refused. No cascade, so track and user deletes clear these rows first.
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
