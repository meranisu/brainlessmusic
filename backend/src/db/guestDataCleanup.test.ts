import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';
import { upsertTrack } from './library.js';
import { insertLibraryRoot } from './libraryRoots.js';
import { insertGuest, insertUser } from './users.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * Migration 0017 (A38): guests' playlists and favorites go, accounts' stay.
 * The test database already has every migration applied, so the file is
 * re-run here against seeded rows; it is written to be safe to run again.
 */

const MIGRATION = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), 'migrations', '0017_delete_guest_playlists_and_favorites.sql'),
  'utf8',
);

function count(sql: string, ...params: unknown[]): number {
  return (db.prepare(sql).get(...params) as { c: number }).c;
}

function seedOwner(userId: number, trackId: number): void {
  const playlist = db.prepare('INSERT INTO playlists (name, owner_id) VALUES (?, ?)').run('mine', userId);
  db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, 0)').run(
    playlist.lastInsertRowid,
    trackId,
  );
  db.prepare('INSERT INTO favorites (user_id, track_id) VALUES (?, ?)').run(userId, trackId);
}

describe('migration 0017: delete guest playlists and favorites', () => {
  let guestId: number;
  let accountId: number;

  beforeEach(() => {
    resetDatabase();
    const rootId = insertLibraryRoot('/library', null).id;
    const track = upsertTrack({
      path: '/library/song.mp3',
      title: 'Song',
      artistName: null,
      albumTitle: null,
      albumYear: null,
      trackNumber: null,
      duration: 1,
      format: 'MP3',
      fileSize: 1,
      rootId,
    });
    guestId = insertGuest().id;
    accountId = insertUser('listener', 'unused-hash').id;
    seedOwner(guestId, track.id);
    seedOwner(accountId, track.id);
  });

  it("removes a guest's playlists, their tracks and favorites", () => {
    db.exec(MIGRATION);

    assert.equal(count('SELECT COUNT(*) c FROM playlists WHERE owner_id = ?', guestId), 0);
    assert.equal(count('SELECT COUNT(*) c FROM favorites WHERE user_id = ?', guestId), 0);
    assert.equal(
      count('SELECT COUNT(*) c FROM playlist_tracks pt JOIN playlists p ON p.id = pt.playlist_id WHERE p.owner_id = ?', guestId),
      0,
    );
    assert.equal(count('SELECT COUNT(*) c FROM playlist_tracks'), 1, 'no orphaned playlist_tracks rows');
  });

  it("leaves an account's playlists and favorites alone, and the guest itself", () => {
    db.exec(MIGRATION);

    assert.equal(count('SELECT COUNT(*) c FROM playlists WHERE owner_id = ?', accountId), 1);
    assert.equal(count('SELECT COUNT(*) c FROM favorites WHERE user_id = ?', accountId), 1);
    assert.equal(count('SELECT COUNT(*) c FROM users WHERE id = ?', guestId), 1, 'the guest keeps its identity');
  });

  it('is harmless when run again', () => {
    db.exec(MIGRATION);
    db.exec(MIGRATION);

    assert.equal(count('SELECT COUNT(*) c FROM playlists'), 1);
  });
});
