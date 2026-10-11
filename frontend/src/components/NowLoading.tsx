import { useState } from 'react';

/**
 * The full-screen wait after a refresh: the session check, then the page's chunk. An IIDX-style "NOW LOADING" plate
 * over a seven-key strip whose lit key walks across on the beat.
 */

/** 7 keys plus a rest beat, so each lap is two bars at `--beat`. Keep in step with `.now-loading-key` in index.css. */
const LAP_MS = 8 * 400;

/** Held back this long after the app starts, so a quick refresh shows nothing rather than flashing the plate. */
const SHOW_AT = performance.now() + 250;

export function NowLoading() {
  // Read once per mount: a re-render must not jump the walk or replay the fade.
  const [now] = useState(() => performance.now());
  const wait = Math.max(0, SHOW_AT - now);

  return (
    <div
      // The app's own ground, opaque from the first frame, so the page arriving behind it doesn't shift colour.
      className="app-ground fixed inset-0 z-50 flex items-center justify-center px-6"
      role="status"
    >
      <div
        className="flex flex-col items-center gap-7"
        style={{
          // The auth gate and the route fallback each mount their own copy; reading the phase off the page clock
          // means the hand-over doesn't restart the walk or the fade.
          ['--now-loading-phase' as string]: `${-(now % LAP_MS)}ms`,
          ...(wait > 0 ? { animation: `now-loading-in 160ms ease-out ${wait}ms both` } : {}),
        }}
      >
        <p className="font-display text-[clamp(1.75rem,6vw,3rem)] font-extrabold uppercase leading-none tracking-[0.08em] text-white">
          Now loading
        </p>
        <div className="flex items-start gap-1.5" aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              // Odd keys sit low and wide, even keys high and narrow, like the cabinet's keyboard.
              className={`now-loading-key ${i % 2 === 0 ? 'mt-3 h-9 w-5' : 'h-8 w-4'}`}
              style={{ ['--key' as string]: i }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
