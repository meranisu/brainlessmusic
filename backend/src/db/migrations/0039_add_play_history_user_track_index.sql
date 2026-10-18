-- Smart playlists (A207, A208) count each song's plays and last play for one user: GROUP BY track_id over that user's
-- play_history. With only (user_id, played_at) indexed, SQLite sorts the user's whole history in a temp b-tree for it
-- (about 245 ms at 200k plays); this covering index hands the rows over already grouped (about 75 ms). Costs one more
-- small index entry per play.
CREATE INDEX IF NOT EXISTS idx_play_history_user_track ON play_history (user_id, track_id, skipped, played_at);
