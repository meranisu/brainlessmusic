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
