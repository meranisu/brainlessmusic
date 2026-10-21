-- Listen together problems that clients used to swallow (A parse that failed, a socket that kept dropping, a request
-- that errored). 'android' and 'web' rows come from POST /rooms/issues; 'server' rows from the room socket, only once
-- a user is known so anonymous probes can't push real rows out of the cap. No cascade: user deletes clear these first.
CREATE TABLE IF NOT EXISTS room_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  room_code TEXT,
  message TEXT NOT NULL,
  detail TEXT,
  http_status INTEGER,
  app_version TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_room_issues_created_at ON room_issues(created_at);
CREATE INDEX IF NOT EXISTS idx_room_issues_user_id ON room_issues(user_id);
