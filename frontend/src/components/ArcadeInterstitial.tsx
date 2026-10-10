/**
 * The card between screens: a line of type, a held beat, then black, so the next screen fades up from nothing.
 * Timings are in `lib/interstitial.ts`, since the shell navigates when the blackout completes.
 */

interface ArcadeInterstitialProps {
  /** Short: a plate, not a paragraph. */
  text: string;
  /** A quieter second line, for when the first needs a gloss. */
  detail?: string;
}

export function ArcadeInterstitial({ text, detail }: ArcadeInterstitialProps) {
  return (
    <div
      /* Black, not the app's blue: blue read as a page that had lost its contents. */
      className="interstitial fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black px-6 text-center"
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

/**
 * The black lifting off the new page, mounted after navigation so card and veil meet opaque. Without it the page cut in.
 * `pointer-events-none`: the page is live from the first frame.
 */
export function ArrivalVeil() {
  return <span aria-hidden className="arrival-veil pointer-events-none fixed inset-0 z-[60] bg-black" />;
}
