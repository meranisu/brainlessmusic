-- A playlist's description, private or public: a line or two saying what it is, so a list of playlists is easier to
-- tell apart. NULL when it has none, which is every playlist made before this.
ALTER TABLE playlists ADD COLUMN description TEXT;
