-- Social layer (A239-A241): one "Hide my activity" switch per account. Set, the account is left out of friends' now
-- playing and the activity feed. The feed reads play_history newest first across everyone, so it gets its own index.
ALTER TABLE users ADD COLUMN hide_activity INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at);
