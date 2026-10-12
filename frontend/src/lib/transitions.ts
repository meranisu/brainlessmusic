/**
 * What happens between songs, and around pause, play and skip (A71, A72). Per device, like data saver: a phone on a
 * bike and a desktop at home can reasonably want different things.
 */

export type BetweenSongs = 'gapless' | 'crossfade' | 'fadeOutIn';

export const FADE_LENGTHS = [3, 6, 9, 12] as const;
export type FadeLength = (typeof FADE_LENGTHS)[number];

export interface TransitionPrefs {
  /** One choice of three, so a crossfade and a fade-out-then-in can never both apply. */
  betweenSongs: BetweenSongs;
  /** Seconds, for crossfade and fade-out-then-in alike. */
  fadeSeconds: FadeLength;
  /** A short ramp on pause, play and skip, so stopping never clicks. */
  fadeOnPause: boolean;
  /** No fade between back-to-back tracks of one album, so live albums and mixes stay seamless. */
  keepAlbumsGapless: boolean;
  /** Plays every song at about the same loudness, from the server's measurement (A3). Not a transition, but per device too. */
  levelVolume: boolean;
}

export const DEFAULT_TRANSITIONS: TransitionPrefs = {
  betweenSongs: 'gapless',
  fadeSeconds: 6,
  fadeOnPause: true,
  keepAlbumsGapless: true,
  levelVolume: true,
};

const STORAGE_KEY = 'brainlessmusic.transitions';

export function loadTransitionPrefs(): TransitionPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRANSITIONS;
    const parsed = JSON.parse(raw) as Partial<TransitionPrefs>;
    return {
      betweenSongs: (['gapless', 'crossfade', 'fadeOutIn'] as const).includes(parsed.betweenSongs as BetweenSongs)
        ? (parsed.betweenSongs as BetweenSongs)
        : DEFAULT_TRANSITIONS.betweenSongs,
      fadeSeconds: FADE_LENGTHS.includes(parsed.fadeSeconds as FadeLength)
        ? (parsed.fadeSeconds as FadeLength)
        : DEFAULT_TRANSITIONS.fadeSeconds,
      fadeOnPause: typeof parsed.fadeOnPause === 'boolean' ? parsed.fadeOnPause : DEFAULT_TRANSITIONS.fadeOnPause,
      keepAlbumsGapless:
        typeof parsed.keepAlbumsGapless === 'boolean' ? parsed.keepAlbumsGapless : DEFAULT_TRANSITIONS.keepAlbumsGapless,
      levelVolume: typeof parsed.levelVolume === 'boolean' ? parsed.levelVolume : DEFAULT_TRANSITIONS.levelVolume,
    };
  } catch {
    // Blocked or corrupt storage: the defaults are a working player.
    return DEFAULT_TRANSITIONS;
  }
}

export function saveTransitionPrefs(prefs: TransitionPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Applies for this session; just won't survive a reload.
  }
}

/**
 * True when `next` directly follows `current` on the same album, so A72 keeps the join gapless. There are no disc
 * numbers, so a same-album step back to track 1 counts too: that is disc 2 starting over.
 */
export function isNextOnAlbum(
  current: { albumId?: number | null; trackNumber?: number | null },
  next: { albumId?: number | null; trackNumber?: number | null },
): boolean {
  return (
    current.albumId != null &&
    current.albumId === next.albumId &&
    current.trackNumber != null &&
    (next.trackNumber === current.trackNumber + 1 || (next.trackNumber === 1 && current.trackNumber > 1))
  );
}

/**
 * Whether this browser lets a page set `audio.volume`. iOS and iPadOS ignore it (always 1), so fades there would do
 * nothing and a crossfade would play two songs at full volume; the player falls back to gapless and plain pauses.
 */
export function canFadeVolume(): boolean {
  try {
    const probe = new Audio();
    probe.volume = 0.5;
    return probe.volume === 0.5;
  } catch {
    return false;
  }
}
