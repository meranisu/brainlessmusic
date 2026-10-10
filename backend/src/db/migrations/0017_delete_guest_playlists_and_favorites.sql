-- Guests are listen-only since A37 (2026-10-09), so playlists and favorites a
-- guest made before then can't be reached any more. A38: delete them. Same
-- order as pruneIdleGuests (db/users.ts): playlist_tracks has no cascade.
-- One transaction, so a failure part-way leaves nothing half-deleted.
BEGIN;

DELETE FROM playlist_tracks
WHERE playlist_id IN (
  SELECT p.id FROM playlists p JOIN users u ON u.id = p.owner_id WHERE u.kind = 'guest'
);

DELETE FROM playlists
WHERE owner_id IN (SELECT id FROM users WHERE kind = 'guest');

DELETE FROM favorites
WHERE user_id IN (SELECT id FROM users WHERE kind = 'guest');

COMMIT;
