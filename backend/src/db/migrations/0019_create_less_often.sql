-- Songs an account asked to hear less (A60): swiping right on a queue row. Per account, like favorites; shuffle keeps
-- each one in only about one pass in four. No cascade, like every other table: user and track deletes clear it first.
CREATE TABLE IF NOT EXISTS less_often (
  user_id INTEGER NOT NULL REFERENCES users(id),
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, track_id)
);
