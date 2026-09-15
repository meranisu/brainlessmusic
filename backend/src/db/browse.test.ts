import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  countAlbums,
  countArtists,
  countTracks,
  getAlbumDetail,
  getArtistDetail,
  listAlbums,
  listArtists,
  listTracks,
  searchLibrary,
} from './browse.js';
import { markTracksMissing, upsertTrack } from './library.js';
import { insertLibraryRoot } from './libraryRoots.js';
import { countTopTracks, listTopTracks, recordScrobble } from './plays.js';
import { addTrackToPlaylist, createPlaylist, getPlaylistDetail } from './playlists.js';
import { insertUser } from './users.js';
import { resetDatabase } from '../testing/harness.js';

/**
 * A track whose file is gone is noise in a listing and a `500` when clicked,
 * so browse surfaces leave it out. What must *not* disappear is anything a
 * person curated by hand — see the playlist case at the bottom.
 */

let nextPath = 0;
// Foreign keys are enforced, so every track needs a real `library_roots`
// row — set fresh in `beforeEach` below, since `resetDatabase()` clears it.
let rootId = 0;

function addTrack(title: string, artist: string, album: string | null) {
  return upsertTrack({
    path: `/library/${nextPath++}-${title}.mp3`,
    title,
    artistName: artist,
    albumTitle: album,
    albumYear: null,
    trackNumber: 1,
    duration: 100,
    format: 'MP3',
    fileSize: 1000,
    rootId,
  });
}

/** A track that exists, and one whose file has gone, for the same artist. */
function library(): { present: number; missing: number } {
  const present = addTrack('Alpha Song', 'Shared Artist', 'Shared Album').id;
  const missing = addTrack('Beta Song', 'Shared Artist', 'Shared Album').id;
  markTracksMissing([missing], new Date().toISOString());
  return { present, missing };
}

beforeEach(() => {
  resetDatabase();
  nextPath = 0;
  rootId = insertLibraryRoot('/library', null).id;
});

describe('listing tracks', () => {
  it('leaves out tracks whose file is gone', () => {
    const { present } = library();

    const tracks = listTracks(50, 0);

    assert.deepEqual(tracks.map((t) => t.id), [present]);
    assert.equal(countTracks(), 1, 'the count must agree, or pagination promises a page it cannot serve');
  });

  it('returns only the gone ones on request', () => {
    // How an admin finds them without a separate screen.
    const { missing } = library();

    assert.deepEqual(listTracks(50, 0, { missing: 'only' }).map((t) => t.id), [missing]);
    assert.equal(countTracks({ missing: 'only' }), 1);
  });

  it('returns everything when asked for all', () => {
    library();

    assert.equal(listTracks(50, 0, { missing: 'all' }).length, 2);
    assert.equal(countTracks({ missing: 'all' }), 2);
  });
});

describe('albums and artists', () => {
  it('leaves a gone track out of an album', () => {
    const { present } = library();

    const album = listAlbums(50, 0)[0];
    const detail = getAlbumDetail(album.id)!;

    assert.deepEqual(detail.tracks.map((t) => t.id), [present]);
    assert.equal(album.trackCount, 1, 'the count on the card must match what opening it shows');
  });

  it('drops an album once every track under it is gone', () => {
    // The real case: a whole album left behind by a library root that moved.
    // Without this it sits in the grid forever, opening onto nothing.
    const { id } = addTrack('Only Song', 'Ghost Artist', 'Ghost Album');
    markTracksMissing([id], new Date().toISOString());

    assert.deepEqual(listAlbums(50, 0), []);
    assert.equal(countAlbums(), 0);
  });

  it('drops an artist with nothing left to play', () => {
    const { id } = addTrack('Only Song', 'Ghost Artist', 'Ghost Album');
    markTracksMissing([id], new Date().toISOString());

    assert.deepEqual(listArtists(50, 0), []);
    assert.equal(countArtists(), 0);
  });

  it('keeps an artist who still has something', () => {
    library();

    const artists = listArtists(50, 0);
    assert.equal(artists.length, 1);
    assert.equal(artists[0].trackCount, 1);
  });

  it('still resolves a detail page reached by direct link', () => {
    // Filtering the lists is a tidiness decision; 404-ing a URL someone
    // already holds is a different and worse one.
    const track = addTrack('Only Song', 'Ghost Artist', 'Ghost Album');
    markTracksMissing([track.id], new Date().toISOString());

    const detail = getArtistDetail(track.artist_id!);
    assert.ok(detail, 'the artist still exists, it just has nothing playable');
    assert.deepEqual(detail!.albums, [], 'and its emptied albums are not listed');
  });
});

describe('search', () => {
  it('does not return a gone track', () => {
    const { present } = library();

    // Three characters or more takes the FTS path.
    const results = searchLibrary('song');
    assert.deepEqual(results.tracks.map((t) => t.id), [present]);
  });

  it('does not return one on the short-query path either', () => {
    // Under three characters falls back to LIKE, which the trigram index
    // cannot answer — a separate query that needed the same filter.
    const { present } = library();

    const results = searchLibrary('So');
    assert.deepEqual(results.tracks.map((t) => t.id), [present]);
  });
});

describe('top tracks', () => {
  it('leaves out a gone track that used to be played', () => {
    const { present, missing } = library();
    const user = insertUser('listener', 'hash');
    recordScrobble(user.id, missing, 1000);
    recordScrobble(user.id, present, 1000);

    assert.deepEqual(listTopTracks(50, 0).map((t) => t.id), [present]);
    assert.equal(countTopTracks(), 1);
  });
});

describe('what is deliberately NOT filtered', () => {
  it('keeps a gone track in the playlist someone put it in', () => {
    // Two reasons. A playlist quietly losing a song is a worse surprise than
    // a song that will not play, and `PATCH /playlists/:id/tracks/reorder`
    // requires the client to send back exactly the playlist's current set —
    // so hiding a row here would break drag-to-reorder for that playlist.
    const { present, missing } = library();
    const user = insertUser('listener', 'hash');
    const playlist = createPlaylist('Mine', user.id);
    addTrackToPlaylist(playlist.id, present);
    addTrackToPlaylist(playlist.id, missing);

    const detail = getPlaylistDetail(playlist.id)!;

    assert.equal(detail.tracks.length, 2);
    assert.ok(
      detail.tracks.some((t) => t.id === missing),
      'a hand-curated playlist keeps what was put in it',
    );
  });
});
