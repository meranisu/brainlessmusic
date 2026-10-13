import type { Profile, StatsRange } from '../types/api';

/**
 * The six readings of a listening radar, each 0 to 1, the same as the Android app's (`ListeningRadar.kt`
 * `radarValues`), so a profile reads alike on both. Rates and the like count rise toward 1 and never quite reach it;
 * the rest are shares.
 */
export interface RadarReading {
  name: string;
  value: number;
  /** The number behind it, in words. */
  detail: string;
}

/** How many days the stats cover: the range's own length, or for all time the days since the account began. */
export function rangeDays(range: StatsRange, memberSince: string, today = new Date()): number {
  if (range === 'week') return 7;
  if (range === 'month') return 30;
  if (range === 'year') return 365;
  const start = Date.parse(`${memberSince.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start)) return 1;
  return Math.max(1, Math.floor((today.getTime() - start) / 86_400_000) + 1);
}

const rising = (x: number, k: number) => 1 - Math.exp(-x / k);
const share = (part: number, whole: number) => (whole <= 0 ? 0 : Math.min(1, Math.max(0, part / whole)));
const oneDecimal = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ''));

export function radarReadings(profile: Pick<Profile, 'totals' | 'topArtists' | 'liked' | 'memberSince'>, range: StatsRange): RadarReading[] {
  const { plays, msListened, tracks, artists } = profile.totals;
  const days = rangeDays(range, profile.memberSince);
  const playsADay = plays / days;
  const hoursADay = msListened / 3_600_000 / days;
  const topPlays = profile.topArtists[0]?.plays ?? 0;
  const liked = profile.liked.total;
  return [
    { name: 'Plays', value: rising(playsADay, 12), detail: `${oneDecimal(playsADay)} a day` },
    { name: 'Time', value: rising(hoursADay, 1), detail: `${oneDecimal(hoursADay)} h a day` },
    { name: 'Variety', value: share(tracks, plays), detail: `${tracks.toLocaleString()} different songs` },
    { name: 'Reach', value: share(artists, tracks), detail: `${artists.toLocaleString()} artists` },
    {
      name: 'Devotion',
      value: share(topPlays, plays),
      detail: profile.topArtists[0] ? `${Math.round(share(topPlays, plays) * 100)}% ${profile.topArtists[0].name}` : 'no top artist yet',
    },
    { name: 'Loved', value: liked / (liked + 50), detail: `${liked.toLocaleString()} liked` },
  ];
}
