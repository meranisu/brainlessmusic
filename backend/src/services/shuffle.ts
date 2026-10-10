export interface ShuffleTrack {
  trackId: number;
  artistId: number | null;
}

function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const NO_ARTIST_KEY = '__none__';

/**
 * Reorders so the same artist never plays back-to-back where possible: greedily take the largest remaining group
 * that isn't the last artist ("reorganize string"). Pre-shuffled, so ties and in-group order are random.
 */
export function smartShuffle(tracks: ShuffleTrack[]): number[] {
  const groups = new Map<string, number[]>();
  for (const { trackId, artistId } of shuffleArray(tracks)) {
    const key = artistId === null ? NO_ARTIST_KEY : String(artistId);
    const list = groups.get(key);
    if (list) list.push(trackId);
    else groups.set(key, [trackId]);
  }

  const buckets = [...groups.values()];
  const result: number[] = [];
  let lastBucket: number[] | null = null;

  while (buckets.some((b) => b.length > 0)) {
    buckets.sort((a, b) => b.length - a.length);

    const chosen =
      buckets.find((b) => b.length > 0 && b !== lastBucket) ?? buckets.find((b) => b.length > 0)!;

    result.push(chosen.shift()!);
    lastBucket = chosen;
  }

  return result;
}

/** mulberry32: small, fast and seedable. Not for secrets. */
function seededRandom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same seed, same order, so a client can page through a shuffled library with no server state. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * A seeded order where heavier items tend to come earlier (Efraimidis–Spirakis: sort by `u^(1/w)`). Every item is still
 * in it once; weight only moves it forward. Same seed and weights, same order.
 */
export function seededWeightedOrder<T>(items: T[], weight: (item: T) => number, seed: number): T[] {
  const random = seededRandom(seed);
  return items
    .map((item) => ({ item, key: Math.pow(random(), 1 / Math.max(weight(item), Number.MIN_VALUE)) }))
    .sort((a, b) => b.key - a.key)
    .map(({ item }) => item);
}

/** Rediscover's cap: a song unplayed for this long, or never played, is as far forward as a song gets. */
export const REDISCOVER_MAX_DAYS = 365;

/** Rediscover's weight for a song last played [daysAgo] days back (`null`: never): 1 for today, about 27 at the cap. */
export function rediscoverWeight(daysAgo: number | null): number {
  const days = daysAgo === null ? REDISCOVER_MAX_DAYS : Math.min(Math.max(daysAgo, 0), REDISCOVER_MAX_DAYS);
  return 1 + days / 14;
}

export interface AlbumTrack {
  id: number;
  albumId: number | null;
  trackNumber: number | null;
}

/**
 * Albums in a seeded order, each played through in track order (unnumbered last, then by id). A track with no album
 * is an album of its own.
 */
export function seededAlbumOrder(tracks: AlbumTrack[], seed: number): number[] {
  const albums = new Map<string, AlbumTrack[]>();
  for (const track of tracks) {
    const key = track.albumId === null ? `track:${track.id}` : `album:${track.albumId}`;
    const list = albums.get(key);
    if (list) list.push(track);
    else albums.set(key, [track]);
  }
  // Map keys keep first-seen order, and the input is in id order, so the seed alone fixes the result.
  return seededShuffle([...albums.values()], seed).flatMap((album) =>
    [...album]
      .sort((a, b) => (a.trackNumber ?? Infinity) - (b.trackNumber ?? Infinity) || a.id - b.id)
      .map((track) => track.id),
  );
}
