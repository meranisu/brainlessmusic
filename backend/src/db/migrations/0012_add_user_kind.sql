-- Passwordless guest entry. A guest is not a new concept in the data model —
-- it is a `users` row with no password, minted when someone presses the button
-- on the title screen. Everything user-scoped downstream (favorites, playlists,
-- play history, playback_state, media tokens) reads only `request.user.id` and
-- never learns how that id was obtained, so none of it changes.
--
-- `kind` rather than a sentinel `password_hash`: '' is a value bcrypt.compare
-- will happily be asked about, which would leave "this row cannot log in"
-- living in whoever remembers to check it first. A column states it, and
-- `/auth/login` can refuse before it reaches a hash comparison at all.
--
-- Existing rows default to 'account', so the owner's login is untouched.
ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'account';

-- When this row was last seen presenting a valid token. Only guests are
-- pruned by it, and only under cap pressure — see `pruneIdleGuests`. NULL
-- until the first authenticated request, so a row minted and never used again
-- falls back to `created_at` for that decision.
ALTER TABLE users ADD COLUMN last_seen_at TEXT;

-- Both guest queries filter on kind and order by staleness.
CREATE INDEX IF NOT EXISTS idx_users_kind_last_seen ON users(kind, last_seen_at);
