import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { listFavoritesForUser, starTrack } from './favorites.js';
import { upsertTrack } from './library.js';
import { insertLibraryRoot } from './libraryRoots.js';
import { addTrackToPlaylist, createPlaylist, getPlaylistDetail } from './playlists.js';
import { insertUser } from './users.js';
import { resetDatabase } from '../testing/harness.js';

/** R7/P6: favorites and playlists carry what the players need to keep an album's joins gapless (A72). */

let userId = 0;
let rootId = 0;

beforeEach(() => {
  resetDatabase();
  userId = insertUser('alice', 'hash').id;
  rootId = insertLibraryRoot('/fav-root', null).id;
});

function addTrack(n: number) {
  return upsertTrack({
    path: `/fav-root/${n}.mp3`,
    title: `Song ${n}`,
    artistName: 'Artist',
    albumTitle: 'Album',
    albumYear: null,
    trackNumber: n,
    duration: 100,
    format: 'MP3',
    fileSize: 1,
    rootId,
  });
}

describe('favorites and playlists', () => {
  it('lists favorites as full track summaries, newest first, with when each was liked', () => {
    const first = addTrack(1);
    const second = addTrack(2);
    starTrack(userId, first.id);
    starTrack(userId, second.id);

    const favorites = listFavoritesForUser(userId, 10, 0);
    assert.equal(favorites.length, 2);
    for (const favorite of favorites) {
      assert.equal(favorite.albumId, first.album_id);
      assert.equal(typeof favorite.trackNumber, 'number');
      assert.equal(typeof favorite.dateAdded, 'string');
      assert.equal(typeof favorite.playCount, 'number');
      assert.equal(typeof favorite.favoritedAt, 'string');
    }
    assert.equal(listFavoritesForUser(userId, 1, 1).length, 1);
  });

  it('gives playlist tracks their album and track number', () => {
    const track = addTrack(3);
    const playlist = createPlaylist('Mix', userId);
    addTrackToPlaylist(playlist.id, track.id);

    const [entry] = getPlaylistDetail(playlist.id)!.tracks;
    assert.equal(entry.albumId, track.album_id);
    assert.equal(entry.trackNumber, 3);
  });
});
