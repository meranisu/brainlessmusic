-- Bumped whenever the user's password changes. Session and media tokens carry the version they were signed with, and
-- one that no longer matches is refused, so a password reset ends every older session (C8). Tokens signed before this
-- migration carry none, which counts as 0, so nobody is signed out by the upgrade itself.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
