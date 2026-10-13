-- The profile page (A167-A170): a bio, a profile picture, and a pinned favourite song and artist.
-- `avatar_id` names a file under AVATAR_PATH (a content hash, like cover art). The two favourites have no foreign key
-- on purpose: a song or artist that a scan removes would otherwise block that delete, and a pin to something gone is
-- simply not shown (the profile reads it with a LEFT JOIN).
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN avatar_id TEXT;
ALTER TABLE users ADD COLUMN favorite_track_id INTEGER;
ALTER TABLE users ADD COLUMN favorite_artist_id INTEGER;
