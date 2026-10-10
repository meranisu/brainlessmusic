-- Guests are `users` rows with no password. `kind` states that, so `/auth/login` refuses a guest before any hash
-- comparison. Existing rows default to 'account'.
ALTER TABLE users ADD COLUMN kind TEXT NOT NULL DEFAULT 'account';

-- Last valid-token request; guests are pruned by it under cap pressure (`pruneIdleGuests`). NULL falls back to created_at.
ALTER TABLE users ADD COLUMN last_seen_at TEXT;

-- Both guest queries filter on kind and order by staleness.
CREATE INDEX IF NOT EXISTS idx_users_kind_last_seen ON users(kind, last_seen_at);
