-- When a track's file was first observed absent from disk.
--
-- NULL means present. A timestamp means the last sweep could not stat the
-- path; it is cleared the moment the file is seen again, so a library on a
-- mount that comes and goes heals itself rather than accumulating damage.
--
-- Deliberately a flag and not a deletion. The rows this catches on the real
-- database point at `/mnt/wsl/music` — a tmpfs library root that was lost —
-- and deleting them would take favorites and playlist entries with them for
-- files that might still exist in a backup or on another disk. Marking is
-- reversible; deleting is the owner's call, one track at a time, through the
-- endpoint that already exists.
ALTER TABLE tracks ADD COLUMN missing_since TEXT;

CREATE INDEX IF NOT EXISTS idx_tracks_missing_since ON tracks(missing_since);
