-- A38: guests are listen-only since A37, so delete playlists and favorites they made before. Same order as
-- pruneIdleGuests (playlist_tracks has no cascade), in one transaction.
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
