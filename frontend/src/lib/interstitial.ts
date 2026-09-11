/**
 * Timings for the card that plays between screens (`ArcadeInterstitial`).
 *
 * In `lib/` rather than beside the component because the caller needs them as
 * much as the component does: the shell has to navigate at exactly the moment
 * the blackout completes, and a duration duplicated in a stylesheet, a
 * component and a `setTimeout` is a duration that will eventually disagree with
 * itself. Keeping them out of the component file also keeps that file
 * component-only, which is what React Fast Refresh wants.
 *
 * **These must stay in step with `.interstitial-*` in `index.css`.**
 */

/**
 * Two speeds, and the difference between them is the whole argument.
 *
 * `full` is for leaving — Exit and Options. Those happen once, they are worth
 * announcing, and 1.4 seconds reads as ceremony.
 *
 * `brief` is for changing tabs, which happens constantly. The same 1.4s card on
 * every navigation would stop being a flourish by the third press and start
 * being a toll; at 620ms the section name still registers and the app still
 * answers a click. If it wants to be slower, these are the two numbers.
 */
export type InterstitialSpeed = 'full' | 'brief';

const TIMINGS = {
  full: { text: 1100, fade: 320 },
  brief: { text: 420, fade: 200 },
} as const;

/** Text in, held, out. */
export const INTERSTITIAL_TEXT_MS = TIMINGS.full.text;
/** Blackout after the text, before the next screen. */
export const INTERSTITIAL_FADE_MS = TIMINGS.full.fade;
/** What the caller waits before navigating, at the full speed. */
export const INTERSTITIAL_TOTAL_MS = TIMINGS.full.text + TIMINGS.full.fade;

/** Total for a given speed, before reduced motion is considered. */
export function interstitialTotal(speed: InterstitialSpeed): number {
  return TIMINGS[speed].text + TIMINGS[speed].fade;
}

/**
 * Honours `prefers-reduced-motion`, and honours it in **JavaScript** as well as
 * in CSS — returning 0, so the navigation happens at once and the card is never
 * shown.
 *
 * Reducing only the animation and keeping the timer is a mistake this codebase
 * has already made once, on the title screen's exit: the screen sat still for
 * the full duration, which made the sequence *slower* for the people who had
 * asked for less of it.
 */
export function interstitialDuration(speed: InterstitialSpeed = 'full'): number {
  const total = interstitialTotal(speed);
  if (typeof window === 'undefined') return total;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : total;
}
