/** Smart auto-mixes (A234): song radio, the endless queue's source, and daily mixes. */
import type { TrackSummary } from '../types/api';
import { apiClient } from './apiClient';
import { getItem, setItem } from './safeStorage';

export interface DailyMix {
  id: number;
  name: string;
  tracks: TrackSummary[];
}

/** Songs per radio request; the queue tops up again when 20 are left. */
const RADIO_PAGE = 40;
/** The server takes at most this many ids to leave out; the most recent are the ones that matter. */
const MAX_EXCLUDE = 1000;

function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

export async function fetchRadio(seedTrackId: number, seed: number, exclude: readonly number[]): Promise<TrackSummary[]> {
  const params = new URLSearchParams({ seedTrackId: String(seedTrackId), seed: String(seed), limit: String(RADIO_PAGE) });
  const recent = exclude.slice(-MAX_EXCLUDE);
  if (recent.length > 0) params.set('exclude', recent.join(','));
  const { tracks } = await apiClient.get<{ tracks: TrackSummary[] }>(`/mix/radio?${params}`);
  return tracks.filter((track) => !track.missing);
}

/**
 * A queue source that keeps playing songs like [seedTrackId]. [queuedIds] is read at each refill so nothing already in
 * the queue comes back; one seed per radio, so its pages are one pick, not several overlapping ones.
 */
export function radioSource(seedTrackId: number, queuedIds: () => readonly number[]): () => Promise<TrackSummary[]> {
  const seed = randomSeed();
  return () => fetchRadio(seedTrackId, seed, [seedTrackId, ...queuedIds()]);
}

export function fetchDailyMixes(): Promise<{ mixes: DailyMix[] }> {
  return apiClient.get<{ mixes: DailyMix[] }>('/mix/daily');
}

const ENDLESS_KEY = 'brainlessmusic.endlessQueue';

/** On unless turned off (A235). Per device, like data saver. */
export function loadEndlessPreference(): boolean {
  return getItem(ENDLESS_KEY) !== 'false';
}

export function saveEndlessPreference(enabled: boolean): void {
  setItem(ENDLESS_KEY, String(enabled));
}
