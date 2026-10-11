-- A song cut short before the scrobble threshold (half the song or 4 minutes), recorded since A113. Counts toward
-- minutes listened and Recently played, never toward plays, top lists, `tracks.play_count` or shuffle recency. 0 on
-- every row from before this migration: until then only plays past the threshold were sent.
ALTER TABLE play_history ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0;
