import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { setTrackFeatures } from '../db/audioFeatures.js';
import { db } from '../db/connection.js';
import { upsertTrack } from '../db/library.js';
import { insertLibraryRoot } from '../db/libraryRoots.js';
import { coPlayCounts, getMixTrack, listDailySeedGenres, type MixTrack } from '../db/similarity.js';
import { insertUser } from '../db/users.js';
import { resetDatabase } from '../testing/harness.js';
import { FEATURES_VERSION } from './audioFeatures.js';
import { buildRadio, clearDailyMixCache, getDailyMixes, scoreTrack, spreadArtists } from './mix.js';

/** Smart auto-mixes (A234): what a radio picks, in what order, and that daily mixes hold still for a day. */

let alice: number;
let bob: number;
let rootId: number;
let n = 0;

function addTrack(artist: string, year: number | null, genres: string[] = [], album = `${artist} album`): number {
  n += 1;
  const track = upsertTrack({
    path: `/mix/${n}.opus`,
    title: `Song ${n}`,
    artistName: artist,
    albumTitle: album,
    albumYear: year,
    trackNumber: n,
    duration: 200,
    format: 'OPUS',
    fileSize: 1,
    rootId,
  });
  for (const name of genres) {
    db.prepare('INSERT OR IGNORE INTO genres (name) VALUES (?)').run(name);
    const { id } = db.prepare('SELECT id FROM genres WHERE name = ?').get(name) as { id: number };
    db.prepare('INSERT INTO track_genres (track_id, genre_id) VALUES (?, ?)').run(track.id, id);
  }
  return track.id;
}

/** A play [minutesAgo] minutes back. */
function play(userId: number, trackId: number, minutesAgo: number, skipped = 0) {
  db.prepare(
    `INSERT INTO play_history (user_id, track_id, played_at, ms_played, skipped)
     VALUES (?, ?, datetime('now', ?), 1000, ?)`,
  ).run(userId, trackId, `-${minutesAgo} minutes`, skipped);
}

function track(id: number, overrides: Partial<MixTrack> = {}): MixTrack {
  return { id, artistId: null, albumArtistId: null, year: null, genreIds: [], liked: false, ...overrides };
}

beforeEach(() => {
  resetDatabase();
  clearDailyMixCache();
  n = 0;
  alice = insertUser('alice', 'hash').id;
  bob = insertUser('bob', 'hash').id;
  rootId = insertLibraryRoot('/mix', null).id;
});

describe('scoreTrack', () => {
  const seed = track(1, { artistId: 10, year: 2000, genreIds: [1, 2] });
  const empty = { seed, coPlays: new Map(), features: new Map(), stats: null };

  it('ranks shared genres, then co-plays, over a shared year', () => {
    const genre = scoreTrack(track(2, { genreIds: [1, 2] }), empty);
    const year = scoreTrack(track(3, { year: 2000 }), empty);
    const coPlayed = scoreTrack(track(4), { ...empty, coPlays: new Map([[4, 3]]) });
    assert.ok(genre > coPlayed && coPlayed > year && year > 0);
  });

  it('leaves missing audio out instead of scoring it 0', () => {
    const withAudio = {
      ...empty,
      features: new Map([[1, { tempo: 120, energy: 0.2, dynamics: 6, brightness: 0.05 }]]),
      stats: {
        mean: { tempo: 120, energy: 0.2, dynamics: 6, brightness: 0.05 },
        sd: { tempo: 10, energy: 0.1, dynamics: 2, brightness: 0.02 },
      },
    };
    const candidate = track(2, { genreIds: [1, 2] });
    assert.equal(scoreTrack(candidate, withAudio), scoreTrack(candidate, empty));
  });

  it('scores a sound-alike above a sound-unlike', () => {
    const stats = {
      mean: { tempo: 120, energy: 0.2, dynamics: 6, brightness: 0.05 },
      sd: { tempo: 10, energy: 0.1, dynamics: 2, brightness: 0.02 },
    };
    const features = new Map([
      [1, { tempo: 120, energy: 0.2, dynamics: 6, brightness: 0.05 }],
      [2, { tempo: 122, energy: 0.21, dynamics: 6.5, brightness: 0.05 }],
      [3, { tempo: 170, energy: 0.6, dynamics: 15, brightness: 0.12 }],
    ]);
    const context = { ...empty, features, stats };
    assert.ok(scoreTrack(track(2), context) > scoreTrack(track(3), context));
  });
});

describe('spreadArtists', () => {
  it('moves a repeat of the last artist back when another artist is left', () => {
    const order = spreadArtists([track(1, { artistId: 1 }), track(2, { artistId: 1 }), track(3, { artistId: 2 })]);
    assert.deepEqual(order.map((t) => t.id), [1, 3, 2]);
  });
});

describe('coPlayCounts', () => {
  it('counts unskipped neighbours within 30 minutes, either side', () => {
    const seed = addTrack('A', 2000);
    const before = addTrack('B', 2000);
    const after = addTrack('C', 2000);
    const far = addTrack('D', 2000);
    const skipped = addTrack('E', 2000);

    play(alice, before, 100);
    play(alice, seed, 96);
    play(alice, after, 92);
    play(bob, seed, 50);
    play(bob, after, 47);
    play(bob, far, 5);
    play(alice, seed, 300);
    play(alice, skipped, 298, 1);

    assert.deepEqual(Object.fromEntries(coPlayCounts(seed)), { [before]: 1, [after]: 2 });
  });
});

describe('buildRadio', () => {
  it('picks genre and artist matches, never the seed, hidden or less-often songs', () => {
    const seed = addTrack('Rock Band', 1999, ['Rock']);
    const sameGenre = addTrack('Other Rock', 1980, ['Rock']);
    const sameArtist = addTrack('Rock Band', 2015, [], 'Rock Band b-sides');
    const unrelated = addTrack('Jazz Trio', 1960, ['Jazz']);
    const hidden = addTrack('Hidden', 1999, ['Rock']);
    const disliked = addTrack('Disliked', 1999, ['Rock']);
    db.prepare('UPDATE tracks SET hidden = 1 WHERE id = ?').run(hidden);
    db.prepare('INSERT INTO less_often (user_id, track_id) VALUES (?, ?)').run(alice, disliked);

    const ids = buildRadio({ seedTrackId: seed, userId: alice, seed: 1, exclude: [], limit: 50 });
    assert.deepEqual(new Set(ids), new Set([sameGenre, sameArtist]));
    assert.ok(!ids!.includes(unrelated));
  });

  it('never repeats a queued song on refill, and is undefined for an unknown seed', () => {
    const seed = addTrack('S', 2000, ['Pop']);
    const others = Array.from({ length: 12 }, (_, i) => addTrack(`Artist ${i}`, 2000, ['Pop']));

    const first = buildRadio({ seedTrackId: seed, userId: alice, seed: 7, exclude: [], limit: 5 })!;
    const second = buildRadio({ seedTrackId: seed, userId: alice, seed: 7, exclude: first, limit: 5 })!;
    assert.equal(first.length, 5);
    assert.equal(second.length, 5);
    assert.equal(new Set([...first, ...second]).size, 10);
    assert.ok([...first, ...second].every((id) => others.includes(id)));
    assert.equal(buildRadio({ seedTrackId: 99999, userId: alice, seed: 7, exclude: [], limit: 5 }), undefined);
  });

  it('prefers the sound-alike when tags tie', () => {
    const seed = addTrack('S', 2000, ['Pop']);
    const alike = addTrack('A', 2000, ['Pop']);
    const unlike = addTrack('B', 2000, ['Pop']);
    const filler = Array.from({ length: 6 }, (_, i) => addTrack(`F${i}`, 2000, ['Pop']));
    setTrackFeatures(seed, FEATURES_VERSION, 1, { tempo: 120, energy: 0.2, dynamics: 6, brightness: 0.05 });
    setTrackFeatures(alike, FEATURES_VERSION, 1, { tempo: 121, energy: 0.2, dynamics: 6, brightness: 0.05 });
    setTrackFeatures(unlike, FEATURES_VERSION, 1, { tempo: 175, energy: 0.7, dynamics: 18, brightness: 0.15 });
    for (const [i, id] of filler.entries()) {
      setTrackFeatures(id, FEATURES_VERSION, 1, { tempo: 90 + i * 10, energy: 0.3, dynamics: 9, brightness: 0.08 });
    }

    // Over many seeds the close match lands first far more often than the far one.
    let alikeFirst = 0;
    let unlikeFirst = 0;
    for (let s = 0; s < 200; s += 1) {
      const [top] = buildRadio({ seedTrackId: seed, userId: alice, seed: s, exclude: [], limit: 8 })!;
      if (top === alike) alikeFirst += 1;
      if (top === unlike) unlikeFirst += 1;
    }
    assert.ok(alikeFirst > unlikeFirst * 2, `alike first ${alikeFirst} times, unlike ${unlikeFirst}`);
  });
});

describe('getMixTrack', () => {
  it('carries the album artist, year and genres', () => {
    const id = addTrack('Band', 1977, ['Punk', 'Rock']);
    const mix = getMixTrack(id, alice)!;
    assert.equal(mix.year, 1977);
    assert.equal(mix.genreIds.length, 2);
    assert.equal(mix.liked, false);
  });
});

describe('daily mixes', () => {
  function seedListening() {
    const rock = Array.from({ length: 8 }, (_, i) => addTrack(`Rock ${i}`, 1990, ['Rock']));
    const jazz = Array.from({ length: 8 }, (_, i) => addTrack(`Jazz ${i}`, 1960, ['Jazz']));
    for (const [i, id] of rock.entries()) for (let k = 0; k <= i; k += 1) play(alice, id, 60 * (i + 1) + k);
    play(alice, jazz[0], 5000);
    return { rock, jazz };
  }

  it('makes one mix per top genre, most played genre first', () => {
    const { rock, jazz } = seedListening();
    const mixes = getDailyMixes(alice);
    assert.deepEqual(mixes.map((mix) => mix.name), ['Rock', 'Jazz']);
    assert.ok(mixes[0].trackIds.every((id) => rock.includes(id)));
    assert.ok(mixes[1].trackIds.includes(jazz[0]));
    assert.equal(new Set(mixes[0].trackIds).size, mixes[0].trackIds.length, 'no song twice in a mix');
  });

  it('holds still within a day and changes the next', () => {
    seedListening();
    const now = Date.UTC(2026, 9, 20, 9);
    const morning = getDailyMixes(alice, now);
    clearDailyMixCache();
    assert.deepEqual(getDailyMixes(alice, now + 6 * 3_600_000), morning, 'same day, rebuilt from scratch, same mixes');
    clearDailyMixCache();
    assert.notDeepEqual(getDailyMixes(alice, now + 24 * 3_600_000)[0].trackIds, morning[0].trackIds);
  });

  it('is empty for someone with no plays, and skips do not count', () => {
    const id = addTrack('X', 2000, ['Rock']);
    play(bob, id, 10, 1);
    assert.deepEqual(getDailyMixes(bob), []);
    assert.deepEqual(listDailySeedGenres(bob, 30, 6, 3), []);
  });
});
