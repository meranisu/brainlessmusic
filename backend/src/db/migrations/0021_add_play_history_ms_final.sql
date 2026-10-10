-- A62: the app reports how long a song really played, after the scrobble. `ms_final = 1` marks a play whose ms_played
-- is that final number; older plays (and any whose final report never came) hold only the time at the scrobble
-- threshold, so stats count them as one full play of the song.
ALTER TABLE play_history ADD COLUMN ms_final INTEGER NOT NULL DEFAULT 0;
