import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smartShuffle, type ShuffleTrack } from './shuffle.js';

function adjacentSameArtistPairs(order: number[], tracks: ShuffleTrack[]): number {
  const artistById = new Map(tracks.map((t) => [t.trackId, t.artistId]));
  let violations = 0;
  for (let i = 1; i < order.length; i++) {
    if (artistById.get(order[i]) === artistById.get(order[i - 1])) violations++;
  }
  return violations;
}

test('returns every track id exactly once', () => {
  const tracks: ShuffleTrack[] = [
    { trackId: 1, artistId: 1 },
    { trackId: 2, artistId: 2 },
    { trackId: 3, artistId: 3 },
    { trackId: 4, artistId: 1 },
  ];
  const result = smartShuffle(tracks);
  assert.deepEqual([...result].sort((a, b) => a - b), [1, 2, 3, 4]);
});

test('zero adjacent same-artist pairs on a balanced distribution', () => {
  // 4 artists x 5 tracks each — no artist is anywhere near half the set.
  const tracks: ShuffleTrack[] = [];
  for (let artistId = 1; artistId <= 4; artistId++) {
    for (let n = 0; n < 5; n++) {
      tracks.push({ trackId: artistId * 100 + n, artistId });
    }
  }

  for (let trial = 0; trial < 20; trial++) {
    const result = smartShuffle(tracks);
    assert.equal(adjacentSameArtistPairs(result, tracks), 0);
  }
});

test('minimizes (does not eliminate) violations on a skewed distribution', () => {
  // 10 tracks from artist 1, 2 from artist 2 — artist 1 exceeds half of 12,
  // so some adjacency is mathematically unavoidable, but it should be the
  // theoretical minimum: dominant count - (rest + 1) = 10 - 3 = 7.
  const tracks: ShuffleTrack[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ trackId: i, artistId: 1 })),
    { trackId: 100, artistId: 2 },
    { trackId: 101, artistId: 2 },
  ];

  const result = smartShuffle(tracks);
  assert.equal(result.length, 12);
  assert.equal(adjacentSameArtistPairs(result, tracks), 7);
});

test('single-artist set returns a valid randomized order without erroring', () => {
  const tracks: ShuffleTrack[] = Array.from({ length: 6 }, (_, i) => ({
    trackId: i,
    artistId: 42,
  }));

  const result = smartShuffle(tracks);
  assert.deepEqual([...result].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
});

test('treats missing artist_id (null) as its own group, not scattered singletons', () => {
  const tracks: ShuffleTrack[] = [
    { trackId: 1, artistId: null },
    { trackId: 2, artistId: null },
    { trackId: 3, artistId: 1 },
    { trackId: 4, artistId: 2 },
  ];
  const result = smartShuffle(tracks);
  assert.equal(adjacentSameArtistPairs(result, tracks), 0);
});

test('empty input returns empty output', () => {
  assert.deepEqual(smartShuffle([]), []);
});

test('repeated calls on the same input produce different orderings', () => {
  const tracks: ShuffleTrack[] = [];
  for (let artistId = 1; artistId <= 5; artistId++) {
    for (let n = 0; n < 4; n++) {
      tracks.push({ trackId: artistId * 100 + n, artistId });
    }
  }

  const orderings = new Set<string>();
  for (let i = 0; i < 10; i++) {
    orderings.add(smartShuffle(tracks).join(','));
  }

  assert.ok(orderings.size > 1, 'expected multiple distinct orderings across 10 runs');
});
