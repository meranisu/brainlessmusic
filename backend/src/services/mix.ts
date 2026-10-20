import { getFeatureStats, getTrackFeatures, type AudioFeatures, type FeatureStats } from '../db/audioFeatures.js';
import {
  coPlayCounts,
  ERA_YEARS,
  findCandidates,
  getMixTrack,
  listDailySeedGenres,
  type MixTrack,
} from '../db/similarity.js';
import { FEATURES_VERSION } from './audioFeatures.js';
import { seededWeightedOrder } from './shuffle.js';

/** How much each kind of likeness counts. Sums to 1; tuned by ear, not measured. */
export const WEIGHTS = {
  genre: 0.3,
  coPlay: 0.25,
  audio: 0.25,
  artist: 0.1,
  year: 0.05,
  liked: 0.05,
} as const;

/** Songs scored per request. The SQL puts genre and artist matches first, so the cap trims the era tail. */
const CANDIDATE_CAP = 1500;
/** Only this many of the best go into the seeded pick, so a radio stays close to its seed. */
const POOL_SIZE = 200;
/** Co-plays at which that part of the score is full; one shared session already means something. */
const COPLAY_FULL = 3;

function jaccard(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const set = new Set(a);
  const shared = b.filter((id) => set.has(id)).length;
  return shared / (a.length + b.length - shared);
}

/**
 * 1 for identical sound, falling toward 0 as the z-scored features drift apart. A track with no tempo is compared on
 * the other three. Null when either side has no features yet: that part then counts for nothing rather than for 0.
 */
export function audioLikeness(a: AudioFeatures | undefined, b: AudioFeatures | undefined, stats: FeatureStats | null): number | null {
  if (!a || !b || !stats) return null;
  const keys = ['energy', 'dynamics', 'brightness'] as const;
  let sum = 0;
  for (const key of keys) sum += ((a[key] - b[key]) / stats.sd[key]) ** 2;
  let count = keys.length;
  if (a.tempo !== null && b.tempo !== null) {
    sum += ((a.tempo - b.tempo) / stats.sd.tempo) ** 2;
    count += 1;
  }
  return Math.exp(-Math.sqrt(sum / count));
}

export interface ScoreContext {
  seed: MixTrack;
  coPlays: ReadonlyMap<number, number>;
  features: ReadonlyMap<number, AudioFeatures>;
  stats: FeatureStats | null;
}

/** How close [track] is to the seed, 0 to 1. Pure, so the weighting can be tested without a library. */
export function scoreTrack(track: MixTrack, context: ScoreContext): number {
  const { seed } = context;
  const parts: Array<[number, number | null]> = [
    [WEIGHTS.genre, jaccard(seed.genreIds, track.genreIds)],
    [WEIGHTS.coPlay, Math.min((context.coPlays.get(track.id) ?? 0) / COPLAY_FULL, 1)],
    [WEIGHTS.audio, audioLikeness(context.features.get(seed.id), context.features.get(track.id), context.stats)],
    [
      WEIGHTS.artist,
      seed.artistId !== null && track.artistId === seed.artistId
        ? 1
        : seed.albumArtistId !== null && track.albumArtistId === seed.albumArtistId
          ? 0.5
          : 0,
    ],
    [
      WEIGHTS.year,
      seed.year !== null && track.year !== null ? Math.max(0, 1 - Math.abs(seed.year - track.year) / (ERA_YEARS + 1)) : 0,
    ],
    [WEIGHTS.liked, track.liked ? 1 : 0],
  ];

  // Missing audio is left out of the total rather than scored 0, so a library mid-backfill still ranks sensibly.
  let total = 0;
  let weight = 0;
  for (const [w, value] of parts) {
    if (value === null) continue;
    total += w * value;
    weight += w;
  }
  return weight === 0 ? 0 : total / weight;
}

/**
 * Spreads artists out: walks the order and, when a song repeats the last artist, swaps in the next song that doesn't.
 * Deterministic, unlike `smartShuffle`, so a daily mix is the same all day.
 */
export function spreadArtists(tracks: MixTrack[]): MixTrack[] {
  const result = [...tracks];
  for (let i = 1; i < result.length; i += 1) {
    const last = result[i - 1].artistId;
    if (last === null || result[i].artistId !== last) continue;
    const swap = result.findIndex((track, j) => j > i && track.artistId !== last);
    if (swap > 0) [result[i], result[swap]] = [result[swap], result[i]];
  }
  return result;
}

export interface RadioOptions {
  seedTrackId: number;
  userId: number;
  seed: number;
  exclude: readonly number[];
  limit: number;
}

/**
 * Songs like the seed song, best first in tendency but not strictly: a seeded weighted pick from the closest 200, so
 * two radios from one song differ and a refill (same seed, more excluded) carries on without repeats.
 * Undefined when the seed song doesn't exist.
 */
export function buildRadio(options: RadioOptions): number[] | undefined {
  const seed = getMixTrack(options.seedTrackId, options.userId);
  if (!seed) return undefined;

  const coPlays = coPlayCounts(seed.id);
  const exclude = [...options.exclude, seed.id];
  const candidates = findCandidates(seed, options.userId, [...coPlays.keys()], exclude, CANDIDATE_CAP, options.seed);
  const features = getTrackFeatures([seed.id, ...candidates.map((track) => track.id)], FEATURES_VERSION);
  const context: ScoreContext = { seed, coPlays, features, stats: getFeatureStats(FEATURES_VERSION) };

  const scored = candidates
    .map((track) => ({ track, score: scoreTrack(track, context) }))
    .sort((a, b) => b.score - a.score || a.track.id - b.track.id)
    .slice(0, POOL_SIZE);
  // To the fourth power, so a close match is picked early far more often than a loose one: squared, tags that tie
  // (same genre and era) drowned out the audio difference.
  const picked = seededWeightedOrder(scored, ({ score }) => score ** 4 + 1e-6, options.seed).slice(0, options.limit);
  return spreadArtists(picked.map(({ track }) => track)).map((track) => track.id);
}

export interface DailyMix {
  /** Stable for the day: the genre id. */
  id: number;
  name: string;
  trackIds: number[];
}

/** Up to this many mixes, one per top genre (A236). */
export const MAX_DAILY_MIXES = 6;
export const DAILY_MIX_SIZE = 30;
const DAILY_WINDOW_DAYS = 30;
/** Seed songs per mix; the mix is these spread through radio picks from each of them. */
const SEEDS_PER_MIX = 3;

/** Days since the Unix epoch in UTC, the "date" half of a daily mix's seed. */
export function dayNumber(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

const cache = new Map<number, { day: number; mixes: DailyMix[] }>();

/**
 * Today's mixes for a user: one per top genre of the last 30 days, each made of radio picks from that genre's three
 * most played songs, seeded by user and day. Cached per user until the day changes, so Home and a replay agree.
 */
export function getDailyMixes(userId: number, now = Date.now()): DailyMix[] {
  const day = dayNumber(now);
  const hit = cache.get(userId);
  if (hit && hit.day === day) return hit.mixes;

  const mixes: DailyMix[] = [];
  for (const genre of listDailySeedGenres(userId, DAILY_WINDOW_DAYS, MAX_DAILY_MIXES, SEEDS_PER_MIX)) {
    const seed = (userId * 7919 + day * 104729 + genre.genreId) % 2147483647;
    const chosen = new Set<number>();
    const perSeed = Math.ceil(DAILY_MIX_SIZE / genre.trackIds.length);
    const lists = genre.trackIds.map((seedTrackId) => {
      const picks = buildRadio({ seedTrackId, userId, seed, exclude: [], limit: perSeed * 2 }) ?? [];
      return [seedTrackId, ...picks];
    });
    // Round-robin across seeds, so the mix moves between them instead of playing one seed's radio then the next.
    for (let i = 0; chosen.size < DAILY_MIX_SIZE && lists.some((list) => i < list.length); i += 1) {
      for (const list of lists) {
        if (i < list.length && chosen.size < DAILY_MIX_SIZE) chosen.add(list[i]);
      }
    }
    if (chosen.size > 0) mixes.push({ id: genre.genreId, name: genre.name, trackIds: [...chosen] });
  }

  cache.set(userId, { day, mixes });
  return mixes;
}

/** Forgets cached mixes, for tests. */
export function clearDailyMixCache(): void {
  cache.clear();
}
