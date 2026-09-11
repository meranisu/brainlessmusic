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
 * One speed, for every screen change.
 *
 * There were briefly two — a compressed 620ms for tab changes, on the reasoning
 * that a card on every navigation would start to feel like a toll. The owner
 * looked at both and chose the slower one: the short version read as hurried
 * next to the long one, and a transition that is inconsistent with itself is
 * worse than one that is merely unhurried. So tabs, Exit and Options all run
 * the same 1,420ms.
 *
 * **These must stay in step with `.interstitial-*` in `index.css`.**
 */

/** Text in, held, out. */
export const INTERSTITIAL_TEXT_MS = 1100;
/** Blackout after the text, before the next screen. */
export const INTERSTITIAL_FADE_MS = 320;
/** What the caller waits before navigating. */
export const INTERSTITIAL_TOTAL_MS = INTERSTITIAL_TEXT_MS + INTERSTITIAL_FADE_MS;

/**
 * The other half of the transition, and it was missing.
 *
 * The card faded *to* black and then vanished in the same frame as the
 * navigation, so the new page cut in at full opacity — a hard edge at exactly
 * the moment the sequence was trying to feel unhurried. Going out smoothly and
 * arriving abruptly is worse than not animating at all, because the abruptness
 * is the last thing you see.
 *
 * So the black survives the navigation and lifts off the new page instead.
 * Longer than the fade in, deliberately: revealing wants to feel like a curtain
 * rising, and a reveal that matches the speed of the cut to black reads as a
 * flicker.
 */
export const INTERSTITIAL_ARRIVE_MS = 520;

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
