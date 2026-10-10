-- Guest accounts (A67-A70). A guest code is now a reusable key to one guest: `guest_codes.used_by` is the guest it
-- belongs to, and `used_at` its first use.

-- The name a guest picked, or `Guest 1234`. Shown instead of `username`, which stays the internal unique login name,
-- so a guest can never take an account's name. NULL for rows from before this migration: show `username`.
ALTER TABLE users ADD COLUMN display_name TEXT;

-- "Request a code" from the guest screen (A67). The device keeps a random secret and polls with it; only its hash is
-- stored. On approve, a code is made and bound to a new guest; the device collects the token once (`collected`).
CREATE TABLE IF NOT EXISTS guest_code_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  platform TEXT,
  secret_hash TEXT NOT NULL,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'collected')),
  code_id INTEGER REFERENCES guest_codes(id)
);

CREATE INDEX IF NOT EXISTS idx_guest_code_requests_status ON guest_code_requests (status, created_at);

-- One row per sign-in with a guest code (A69), shown to the admin under the code. Deleted with the code.
CREATE TABLE IF NOT EXISTS guest_code_signins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id INTEGER NOT NULL REFERENCES guest_codes(id),
  platform TEXT,
  user_agent TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_guest_code_signins_code ON guest_code_signins (code_id, created_at);
