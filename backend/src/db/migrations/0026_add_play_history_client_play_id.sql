-- An id the app makes for each play (C10). A play sent twice (an answer lost to a timeout, or an offline play resent)
-- carries the same id both times, so it is counted once. Matching on `played_at` alone misses when the phone's clock and
-- the server's disagree. NULL on rows from before this migration and from clients that don't send one.
ALTER TABLE play_history ADD COLUMN client_play_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_play_history_client_play_id
  ON play_history(user_id, client_play_id) WHERE client_play_id IS NOT NULL;
