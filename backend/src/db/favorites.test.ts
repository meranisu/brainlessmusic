import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { listFavoritesForUser, starTrack } from './favorites.js';
import { upsertTrack } from './library.js';
import { insertLibraryRoot } from './libraryRoots.js';
import { addTrackToPlaylist, createPlaylist, getPlaylistDetail, listPlaylistsForUser } from './playlists.js';
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

  it('lists each playlist with its first albums for the cover, in playlist order, each album once', () => {
    const playlist = createPlaylist('Mix', userId);
    const other = upsertTrack({
      path: '/fav-root/other.mp3', title: 'Other', artistName: 'Artist', albumTitle: 'Second album', albumYear: null,
      trackNumber: 1, duration: 100, format: 'MP3', fileSize: 1, rootId,
    });
    addTrackToPlaylist(playlist.id, other.id);
    addTrackToPlaylist(playlist.id, addTrack(1).id);
    addTrackToPlaylist(playlist.id, addTrack(2).id);
    createPlaylist('Empty', userId);

    const listed = listPlaylistsForUser(userId);
    const mix = listed.find((p) => p.name === 'Mix')!;
    const firstAlbum = getPlaylistDetail(playlist.id)!.tracks[1].albumId;

    assert.equal(mix.trackCount, 3);
    assert.deepEqual(mix.coverAlbumIds, [other.album_id, firstAlbum]);
    assert.deepEqual(listed.find((p) => p.name === 'Empty')!.coverAlbumIds, []);
  });
});
