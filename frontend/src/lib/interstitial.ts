/** Timings for `ArcadeInterstitial`, shared with the shell, which navigates when the blackout ends. Keep in step with `.interstitial-*` in `index.css`. */

/** One speed for every screen change (1,420ms); a faster tab variant read as hurried. Keep in step with `index.css`. */

/** Text in, held, out. */
export const INTERSTITIAL_TEXT_MS = 1100;
/** Blackout after the text, before the next screen. */
export const INTERSTITIAL_FADE_MS = 320;
/** What the caller waits before navigating. */
export const INTERSTITIAL_TOTAL_MS = INTERSTITIAL_TEXT_MS + INTERSTITIAL_FADE_MS;

/** The black lifting off the new page, slower than the fade in so it reads as a curtain rising, not a cut. */
export const INTERSTITIAL_ARRIVE_MS = 520;

/** Reduced motion is honoured in JS too: 0 means navigate at once. Keeping the timer just makes a still screen wait. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function interstitialDuration(): number {
  return prefersReducedMotion() ? 0 : INTERSTITIAL_TOTAL_MS;
}

/** Zero under reduced motion, so the new page is simply there. */
export function arrivalDuration(): number {
  return prefersReducedMotion() ? 0 : INTERSTITIAL_ARRIVE_MS;
}
