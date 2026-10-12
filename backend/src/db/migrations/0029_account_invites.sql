-- Account invites (A107-A112): the admin sends a one-use link, the friend picks a name and password. With
-- `guest_user_id` set, accepting turns that guest into an account instead of adding a row. One use, 7 days (A108).
-- Only a SHA-256 of the link's token is kept, so the database alone can't be used to accept one.
CREATE TABLE IF NOT EXISTS account_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id),
  guest_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by INTEGER REFERENCES users(id),
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_invites_guest ON account_invites (guest_user_id);

-- Names are case-insensitive (A111): `Imran` and `imran` are one person. The column's own UNIQUE stays (SQLite can't
-- drop it without rebuilding the table); this index is the one that now decides. Fails if two rows already differ
-- only by case, which is why smol was checked first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users (username COLLATE NOCASE);
