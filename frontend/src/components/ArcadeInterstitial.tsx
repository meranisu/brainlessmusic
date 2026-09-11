/**
 * The card an arcade cabinet shows between screens.
 *
 * One line of type at size, held for a beat, then a fade to black before the
 * next screen arrives. It is the same idea as the title screen's CRT shut-off —
 * a transition long enough to feel deliberate, and a black frame at the end so
 * the screen it hands to can fade up from nothing rather than cut in.
 *
 * Timings live in `lib/interstitial.ts`, because the shell needs them as much
 * as this does — it has to navigate at exactly the moment the blackout
 * completes.
 */

import type { InterstitialSpeed } from '../lib/interstitial';

interface ArcadeInterstitialProps {
  /** The line itself. Short — this is a plate, not a paragraph. */
  text: string;
  /** A quieter second line, for when the first needs a gloss. */
  detail?: string;
  /** `full` for leaving the app, `brief` for changing tabs. */
  speed?: InterstitialSpeed;
}

export function ArcadeInterstitial({ text, detail, speed = 'full' }: ArcadeInterstitialProps) {
  return (
    <div
      /* Black, not the app's blue. The card is the moment the cabinet is
         between screens, and blue is the colour of *being* on one — grounding
         it in the app's own background made it read as a page that had lost its
         contents rather than as a deliberate gap. Black also means the blackout
         layer has nothing to fight on its way in. */
      className={`interstitial fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black px-6 text-center ${
        speed === 'brief' ? 'is-brief' : ''
      }`}
      role="status"
      aria-live="polite"
    >
      <p className="interstitial-text font-display text-[clamp(1.75rem,7vw,4.5rem)] font-semibold uppercase leading-none tracking-[0.08em] text-white">
        {text}
      </p>
      {detail && (
        <p className="interstitial-detail mt-4 text-xs uppercase tracking-[0.28em] text-blue-300">
          {detail}
        </p>
      )}
      {/* The blackout is its own layer rather than a background colour change,
          so it can run on a delay without disturbing the text's own timing. */}
      <span aria-hidden className="interstitial-blackout pointer-events-none absolute inset-0 bg-black" />
    </div>
  );
}
