import assert from 'node:assert/strict';
import { config } from '../config.js';
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { getAlbumDetail, getArtistDetail, listArtists, resolveAlbumId } from '../db/browse.js';
import { db } from '../db/connection.js';
import { starTrack } from '../db/favorites.js';
import { getGenreDetail, listGenres, splitGenres } from '../db/genres.js';
import { albumFolder, deleteTrackRow, setTrackFlags, updateTrackFields } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { addTrackToPlaylist, createPlaylist, getPlaylistTrackIdsInOrder } from '../db/playlists.js';
import { insertUser } from '../db/users.js';
import { makeTempDir, resetDatabase } from '../testing/harness.js';
import { scanLibrary } from './scanner.js';
import { seededAlbumOrder } from './shuffle.js';

const run = promisify(execFile);

interface Tags {
  title?: string;
  artist?: string;
  album?: string;
  album_artist?: string;
  compilation?: string;
  disc?: string;
  track?: string;
  genre?: string;
}

/** A real one-second mp3, since the scanner reads real tags. ffmpeg writes `album_artist` as TPE2, `compilation` as TCMP. */
async function makeAudio(path: string, tags: Tags): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const args = ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1'];
  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined) args.push('-metadata', `${key}=${value}`);
  }
  args.push(path);
  await run('ffmpeg', args);
}

async function hasFfmpeg(): Promise<boolean> {
  try {
    await run('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

interface Placed {
  track: string;
  album: string;
  albumId: number;
  albumArtist: string | null;
  trackArtist: string;
}

/** Where each track ended up, by title. */
function placement(): Map<string, Placed> {
  const rows = db
    .prepare(
      `SELECT t.title as track, al.title as album, al.id as albumId, aa.name as albumArtist, ta.name as trackArtist
       FROM tracks t JOIN albums al ON al.id = t.album_id
       LEFT JOIN artists aa ON aa.id = al.artist_id
       JOIN artists ta ON ta.id = t.artist_id`,
    )
    .all() as Placed[];
  return new Map(rows.map((r) => [r.track, r]));
}

const albumsWithTracks = (): number =>
  (db.prepare('SELECT COUNT(DISTINCT album_id) as n FROM tracks').get() as { n: number }).n;

describe('album grouping (v0.4, 0030)', async () => {
  const ffmpegAvailable = await hasFfmpeg();
  let library = '';
  let cleanup: () => Promise<void> = async () => {};
  let rootId = 0;

  beforeEach(async () => {
    resetDatabase();
    const dir = await makeTempDir('albums');
    library = dir.path;
    cleanup = dir.cleanup;
    rootId = insertLibraryRoot(library, null).id;
  });

  afterEach(async () => {
    await cleanup();
  });

  it('keys disc folders by the folder above them', () => {
    assert.equal(albumFolder('/m/Album/CD1/01.flac'), '/m/Album');
    assert.equal(albumFolder('/m/Album/Disc 2/01.flac'), '/m/Album');
    assert.equal(albumFolder('/m/Album/disk_03/01.flac'), '/m/Album');
    assert.equal(albumFolder('/m/Album/Disc 1 - Bonus/01.flac'), '/m/Album');
    assert.equal(albumFolder('/m/Album/01.flac'), '/m/Album');
    assert.equal(albumFolder('/m/CDJ Edits/01.flac'), '/m/CDJ Edits');
  });

  it('files a compilation under Various Artists as one album', { skip: !ffmpegAvailable }, async () => {
    const dir = join(library, 'Hits');
    await makeAudio(join(dir, '1.mp3'), { title: 'One', artist: 'A', album: 'Hits', compilation: '1' });
    await makeAudio(join(dir, '2.mp3'), { title: 'Two', artist: 'B', album: 'Hits', compilation: '1' });

    await scanLibrary(library, rootId, config.artworkPath);
    const placed = placement();

    assert.equal(placed.get('One')!.albumId, placed.get('Two')!.albumId);
    assert.equal(placed.get('One')!.albumArtist, 'Various Artists');
    assert.equal(placed.get('Two')!.trackArtist, 'B', 'the track keeps its own artist');

    const detail = getAlbumDetail(placed.get('One')!.albumId)!;
    assert.deepEqual(
      detail.tracks.map((t) => t.artistName).sort(),
      ['A', 'B'],
      'the album page has each track artist',
    );
  });

  it('groups "feat." tracks by the albumartist tag', { skip: !ffmpegAvailable }, async () => {
    const dir = join(library, 'Solo');
    await makeAudio(join(dir, '1.mp3'), { title: 'Alone', artist: 'Main', album: 'Solo', album_artist: 'Main' });
    await makeAudio(join(dir, '2.mp3'), {
      title: 'Together',
      artist: 'Main feat. Guest',
      album: 'Solo',
      album_artist: 'Main',
    });

    await scanLibrary(library, rootId, config.artworkPath);
    const placed = placement();

    assert.equal(placed.get('Alone')!.albumId, placed.get('Together')!.albumId);
    assert.equal(placed.get('Together')!.albumArtist, 'Main');
  });

  it('works out an untagged album artist from its tracks (A148)', { skip: !ffmpegAvailable }, async () => {
    const mostly = join(library, 'Mostly');
    await makeAudio(join(mostly, '1.mp3'), { title: 'M1', artist: 'Lead', album: 'Mostly' });
    await makeAudio(join(mostly, '2.mp3'), { title: 'M2', artist: 'Lead', album: 'Mostly' });
    await makeAudio(join(mostly, '3.mp3'), { title: 'M3', artist: 'Lead & Friend', album: 'Mostly' });
    const mixed = join(library, 'Mixed');
    await makeAudio(join(mixed, '1.mp3'), { title: 'X1', artist: 'P', album: 'Mixed' });
    await makeAudio(join(mixed, '2.mp3'), { title: 'X2', artist: 'Q', album: 'Mixed' });

    await scanLibrary(library, rootId, config.artworkPath);
    const placed = placement();

    assert.equal(placed.get('M1')!.albumId, placed.get('M3')!.albumId);
    assert.equal(placed.get('M3')!.albumArtist, 'Lead', 'two of three tracks is more than half');
    assert.equal(placed.get('X1')!.albumId, placed.get('X2')!.albumId);
    assert.equal(placed.get('X1')!.albumArtist, 'Various Artists', 'one of two is not more than half');
  });

  it('keeps same-titled albums in different folders apart, but joins disc folders', { skip: !ffmpegAvailable }, async () => {
    const tags = { artist: 'VA', album: 'Original Soundtrack', album_artist: 'Various Artists' };
    await makeAudio(join(library, 'Game One', '1.mp3'), { ...tags, title: 'G1' });
    await makeAudio(join(library, 'Game Two', '1.mp3'), { ...tags, title: 'G2' });
    await makeAudio(join(library, 'Big', 'CD1', '1.mp3'), { ...tags, album: 'Big', title: 'B1' });
    await makeAudio(join(library, 'Big', 'CD2', '1.mp3'), { ...tags, album: 'Big', title: 'B2' });

    await scanLibrary(library, rootId, config.artworkPath);
    const placed = placement();

    assert.notEqual(placed.get('G1')!.albumId, placed.get('G2')!.albumId);
    assert.equal(placed.get('B1')!.albumId, placed.get('B2')!.albumId);
  });

  it('is stable: a second scan changes nothing', { skip: !ffmpegAvailable }, async () => {
    const dir = join(library, 'Mixed');
    await makeAudio(join(dir, '1.mp3'), { title: 'X1', artist: 'P', album: 'Mixed' });
    await makeAudio(join(dir, '2.mp3'), { title: 'X2', artist: 'Q', album: 'Mixed' });

    await scanLibrary(library, rootId, config.artworkPath);
    const first = placement();
    const albumRows = (db.prepare('SELECT COUNT(*) as n FROM albums').get() as { n: number }).n;
    await scanLibrary(library, rootId, config.artworkPath);

    assert.deepEqual(placement(), first);
    assert.equal((db.prepare('SELECT COUNT(*) as n FROM albums').get() as { n: number }).n, albumRows);
  });

  describe('upgrading a library scanned before 0030', () => {
    /** The pre-0030 shape: one album per (title, track artist), no folder. */
    function legacyTrack(path: string, title: string, artist: string, album: string): { trackId: number; albumId: number } {
      db.prepare('INSERT OR IGNORE INTO artists (name) VALUES (?)').run(artist);
      const artistId = (db.prepare('SELECT id FROM artists WHERE name = ?').get(artist) as { id: number }).id;
      let row = db.prepare('SELECT id FROM albums WHERE title = ? AND artist_id = ?').get(album, artistId) as
        | { id: number }
        | undefined;
      if (!row) {
        const result = db.prepare('INSERT INTO albums (title, artist_id) VALUES (?, ?)').run(album, artistId);
        row = { id: Number(result.lastInsertRowid) };
      }
      const track = db
        .prepare('INSERT INTO tracks (path, title, artist_id, album_id, file_size, root_id) VALUES (?, ?, ?, ?, 1, ?)')
        .run(path, title, artistId, row.id, rootId);
      return { trackId: Number(track.lastInsertRowid), albumId: row.id };
    }

    it('merges the fragments, keeps one old id, and redirects the rest', { skip: !ffmpegAvailable }, async () => {
      const dir = join(library, 'Party');
      const tags = { album: 'Party', album_artist: 'Host' };
      await makeAudio(join(dir, '1.mp3'), { ...tags, title: 'P1', artist: 'Host' });
      await makeAudio(join(dir, '2.mp3'), { ...tags, title: 'P2', artist: 'Host feat. Guest' });
      await makeAudio(join(dir, '3.mp3'), { ...tags, title: 'P3', artist: 'Guest' });

      const p1 = legacyTrack(join(dir, '1.mp3'), 'P1', 'Host', 'Party');
      const p2 = legacyTrack(join(dir, '2.mp3'), 'P2', 'Host feat. Guest', 'Party');
      const p3 = legacyTrack(join(dir, '3.mp3'), 'P3', 'Guest', 'Party');
      const oldIds = [p1.albumId, p2.albumId, p3.albumId];
      assert.equal(new Set(oldIds).size, 3, 'three fragments before');

      const userId = insertUser('alice', 'hash').id;
      starTrack(userId, p2.trackId);
      const playlist = createPlaylist('mix', userId);
      addTrackToPlaylist(playlist.id, p3.trackId);
      addTrackToPlaylist(playlist.id, p1.trackId);

      await scanLibrary(library, rootId, config.artworkPath);
      const placed = placement();
      const albumId = placed.get('P1')!.albumId;

      assert.equal(albumsWithTracks(), 1, 'one album after');
      assert.ok(oldIds.includes(albumId), 'an old row was adopted, not a new one made');
      assert.equal(placed.get('P1')!.albumArtist, 'Host');
      for (const old of oldIds) assert.equal(resolveAlbumId(old), albumId, `album ${old} leads to the merged album`);

      // Nothing that points at tracks moved.
      assert.deepEqual(placement().get('P2')!.track, 'P2');
      assert.ok(db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND track_id = ?').get(userId, p2.trackId));
      assert.deepEqual(getPlaylistTrackIdsInOrder(playlist.id), [p3.trackId, p1.trackId]);

      // The guest has no album of their own, but shows up on it (A149); the emptied rows don't count anywhere.
      const guest = getArtistDetail(
        (db.prepare("SELECT id FROM artists WHERE name = 'Guest'").get() as { id: number }).id,
      )!;
      assert.deepEqual(guest.albums, []);
      assert.deepEqual(
        guest.appearsOn.map((a) => a.id),
        [albumId],
      );
      assert.equal(guest.albumCount, 0);
      const host = listArtists(50, 0).find((a) => a.name === 'Host')!;
      assert.equal(host.albumCount, 1);
    });

    it('leaves an admin-edited track where the admin put it', { skip: !ffmpegAvailable }, async () => {
      const dir = join(library, 'Edited');
      await makeAudio(join(dir, '1.mp3'), { title: 'E1', artist: 'Someone', album: 'Edited', album_artist: 'Label' });

      await scanLibrary(library, rootId, config.artworkPath);
      const trackId = (db.prepare("SELECT id FROM tracks WHERE title = 'E1'").get() as { id: number }).id;
      updateTrackFields(trackId, { albumTitle: 'Renamed' });
      const before = placement().get('E1')!;

      await scanLibrary(library, rootId, config.artworkPath);

      assert.deepEqual(placement().get('E1'), before);
      assert.equal(before.album, 'Renamed');
    });
  });

  it('plays a two-disc album in disc order (box 26)', { skip: !ffmpegAvailable }, async () => {
    const tags = { artist: 'Band', album: 'Double', album_artist: 'Band' };
    await makeAudio(join(library, 'Double', 'CD2', '01.mp3'), { ...tags, title: 'D2T1', disc: '2', track: '1' });
    await makeAudio(join(library, 'Double', 'CD1', '02.mp3'), { ...tags, title: 'D1T2', disc: '1', track: '2' });
    await makeAudio(join(library, 'Double', 'CD1', '01.mp3'), { ...tags, title: 'D1T1', disc: '1', track: '1' });
    await makeAudio(join(library, 'Double', 'CD2', '02.mp3'), { ...tags, title: 'D2T2', disc: '2', track: '2' });

    await scanLibrary(library, rootId, config.artworkPath);
    const detail = getAlbumDetail(placement().get('D1T1')!.albumId)!;

    assert.deepEqual(
      detail.tracks.map((t) => t.title),
      ['D1T1', 'D1T2', 'D2T1', 'D2T2'],
    );
    assert.deepEqual(
      detail.tracks.map((t) => t.discNumber),
      [1, 1, 2, 2],
    );
  });

  it('album shuffle plays each album in disc order', () => {
    const order = seededAlbumOrder(
      [
        { id: 1, albumId: 7, trackNumber: 1, discNumber: 2 },
        { id: 2, albumId: 7, trackNumber: 2, discNumber: 1 },
        { id: 3, albumId: 7, trackNumber: 1, discNumber: null },
      ],
      42,
    );
    assert.deepEqual(order, [3, 2, 1], 'untagged counts as disc 1');
  });

  it('splits genre tags and merges them without case (box 27)', () => {
    assert.deepEqual(splitGenres(['Rock; Pop', 'rock', 'Drum & Bass/Jungle', ' ', 'Chiptune, Video Game Music']), [
      'Rock',
      'Pop',
      'Drum & Bass',
      'Jungle',
      'Chiptune, Video Game Music',
    ]);
  });

  it('lists genres and their albums, leaving out hidden and deleted tracks', { skip: !ffmpegAvailable }, async () => {
    await makeAudio(join(library, 'One', '1.mp3'), { title: 'O1', artist: 'X', album: 'One', genre: 'Trance;Eurobeat' });
    await makeAudio(join(library, 'Two', '1.mp3'), { title: 'T1', artist: 'Y', album: 'Two', genre: 'trance' });
    await makeAudio(join(library, 'Three', '1.mp3'), { title: 'H1', artist: 'Z', album: 'Three', genre: 'Metal' });

    await scanLibrary(library, rootId, config.artworkPath);
    const byName = () => new Map(listGenres().map((g) => [g.name, g]));

    assert.deepEqual([...byName().keys()], ['Eurobeat', 'Metal', 'Trance']);
    const trance = byName().get('Trance')!;
    assert.equal(trance.trackCount, 2, '"trance" joined "Trance"');
    assert.deepEqual(
      getGenreDetail(trance.id)!.albums.map((a) => a.title),
      ['One', 'Two'],
    );

    const metalTrack = (db.prepare("SELECT id FROM tracks WHERE title = 'H1'").get() as { id: number }).id;
    setTrackFlags([metalTrack], { hidden: true });
    assert.ok(!byName().has('Metal'), 'a genre with only hidden tracks is not listed');

    const oneTrack = (db.prepare("SELECT id FROM tracks WHERE title = 'O1'").get() as { id: number }).id;
    deleteTrackRow(oneTrack);
    assert.ok(!byName().has('Eurobeat'), 'deleting a track clears its genres');

    // A rescan replaces genres rather than adding to them.
    await scanLibrary(library, rootId, config.artworkPath);
    assert.equal(byName().get('Trance')!.trackCount, 2, 'O1 came back, nothing doubled');
  });

  it('joins a stray song filed in another folder into the big album (A154)', { skip: !ffmpegAvailable }, async () => {
    const tags = { artist: 'Pianist', album: 'Keys', album_artist: 'Pianist' };
    for (const n of ['1', '2', '3']) await makeAudio(join(library, 'Keys', `${n}.mp3`), { ...tags, title: `K${n}` });
    await makeAudio(join(library, 'Pianist', 'Keys', '5.mp3'), { ...tags, title: 'K5' });
    // Two full copies stay apart; so do Various Artists albums, however small.
    for (const n of ['1', '2', '3']) {
      await makeAudio(join(library, 'Copy A', `${n}.mp3`), { ...tags, album: 'Twice', title: `A${n}` });
      await makeAudio(join(library, 'Copy B', `${n}.mp3`), { ...tags, album: 'Twice', title: `B${n}` });
    }
    const va = { artist: 'Someone', album: 'OST', album_artist: 'Various Artists' };
    for (const n of ['1', '2', '3']) await makeAudio(join(library, 'Game', `${n}.mp3`), { ...va, title: `G${n}` });
    await makeAudio(join(library, 'Other Game', '1.mp3'), { ...va, title: 'O1' });

    await scanLibrary(library, rootId, config.artworkPath);
    const placed = placement();

    assert.equal(placed.get('K5')!.albumId, placed.get('K1')!.albumId, 'the stray joined');
    assert.notEqual(placed.get('A1')!.albumId, placed.get('B1')!.albumId, 'full copies stay apart');
    assert.notEqual(placed.get('O1')!.albumId, placed.get('G1')!.albumId, 'Various Artists stays per folder');

    // The stray's own album row leads to the big one, and a rescan lands in the same place.
    const strayRow = db
      .prepare("SELECT id FROM albums WHERE folder LIKE '%/Pianist/Keys'")
      .get() as { id: number };
    assert.equal(resolveAlbumId(strayRow.id), placed.get('K1')!.albumId);
    await scanLibrary(library, rootId, config.artworkPath);
    assert.deepEqual(placement(), placed);
  });
});
