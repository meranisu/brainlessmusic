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
