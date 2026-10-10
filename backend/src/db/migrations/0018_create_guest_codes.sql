-- Per-guest entry codes (A42/A43): one code lets one device in, then records who used it. Unused codes expire after
-- 7 days. Rows are kept for the panel; user references are nulled on delete, not cascaded.
CREATE TABLE IF NOT EXISTS guest_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by INTEGER REFERENCES users(id)
);

-- Server-wide switches set from the web instead of `.env`. A missing row means the default.
CREATE TABLE IF NOT EXISTS server_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
