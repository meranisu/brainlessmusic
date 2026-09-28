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
 * Reorders tracks so the same artist doesn't play back-to-back wherever
 * mathematically possible. Groups by artist, then greedily interleaves by
 * always placing next from the largest remaining group that isn't the
 * artist just placed (the standard "reorganize string" approach) — this
 * guarantees zero adjacent same-artist pairs unless one artist makes up
 * more than half the set, in which case it minimizes rather than
 * eliminates violations. The input is pre-shuffled so both the order
 * within a group and tie-breaks between equal-size groups are randomized.
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

/** A small, fast, seedable generator (mulberry32) — enough for shuffling, not for anything secret. */
function seededRandom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The same shuffle for the same seed, every time. That is what lets a client walk a shuffled
 * library in pages ("give me 200, then the next 200") without the server remembering anything:
 * each request re-derives the same order from the seed, so no track repeats until the whole
 * library has been played.
 */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
