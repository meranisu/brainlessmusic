/**
 * The two layers that give the backdrop depth without adding any more type.
 *
 * The wordmark columns and bands are all the same *kind* of thing — flat text
 * sliding — so however many are added, the field reads as one plane with a lot
 * happening on it. Depth needs things that are not type: something with
 * curvature, and something with parallax.
 */

const RING_BANDS = [
  // inset, tilt on X, how long one turn takes in beats, and how bright.
  { inset: '0%', tilt: 68, beats: 340, alpha: 0.44 },
  { inset: '9%', tilt: 74, beats: 289, alpha: 0.32 },
  { inset: '19%', tilt: 61, beats: 233, alpha: 0.38 },
  { inset: '31%', tilt: 79, beats: 181, alpha: 0.24 },
];

/**
 * A tilted orange ring turning on the right, behind everything.
 *
 * Real 3D rather than a spinning image: the stage carries a `perspective`, each
 * band is a circle tilted back on X, and the whole assembly turns on Y. That is
 * what makes the near edge of a band pass visibly closer than its far edge —
 * a flat circle rotated in 2D just spins, and reads as a loading spinner.
 *
 * The bands turn at co-prime beat counts, so the ring never resolves into a
 * single rigid object and never returns to a pose you have already seen.
 *
 * Orange, and the only orange in the backdrop. It is the app's accent — the
 * underline, the boot frame, the enter button — so putting it at the very back
 * of the picture ties the moving field to the furniture in front of it instead
 * of leaving two unrelated colour schemes on screen.
 */
export function SpinRing() {
  return (
    <div aria-hidden className="spin-ring-stage">
      <div className="spin-ring">
        {RING_BANDS.map((band, i) => (
          <span
            key={i}
            className="spin-ring-band"
            style={{
              inset: band.inset,
              // Each band gets its own element-level rotation *inside* the
              // assembly's turn, which is what stops them moving as one plate.
              animationDuration: `calc(var(--beat) * ${band.beats})`,
              ['--band-tilt' as string]: `${band.tilt}deg`,
              ['--band-alpha' as string]: String(band.alpha),
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Where each circle sits, how big it is, how long it takes to drift, and how
 * far into that drift it starts.
 *
 * Written out rather than generated, for a reason that cost a bug elsewhere in
 * this app: `Math.random()` in a component body is re-rolled on every render
 * and twice over under StrictMode, so the field would reshuffle itself whenever
 * anything above it re-rendered. A fixed table is also tunable — a generated
 * one can only be re-rolled and hoped over.
 */
const MOTES = [
  { left: '6%', size: '7rem', beats: 151, delay: -20, alpha: 0.1, drift: '2.5rem' },
  { left: '17%', size: '3.5rem', beats: 97, delay: -61, alpha: 0.14, drift: '-3rem' },
  { left: '29%', size: '11rem', beats: 223, delay: -8, alpha: 0.07, drift: '3.5rem' },
  { left: '41%', size: '2.5rem', beats: 79, delay: -44, alpha: 0.16, drift: '-1.75rem' },
  { left: '54%', size: '6rem', beats: 131, delay: -97, alpha: 0.09, drift: '2rem' },
  { left: '67%', size: '4rem', beats: 109, delay: -33, alpha: 0.12, drift: '-2.5rem' },
  { left: '79%', size: '9rem', beats: 191, delay: -120, alpha: 0.08, drift: '3rem' },
  { left: '91%', size: '3rem', beats: 89, delay: -15, alpha: 0.15, drift: '-2rem' },
];

/**
 * Circles drifting upward at different rates.
 *
 * The parallax the columns provide is one-dimensional — everything travels the
 * same axis at different speeds. These move on two, sideways as well as up, and
 * that second axis is what stops the field reading as a set of sliding blinds.
 *
 * Hollow, like the wordmarks, so whatever is behind them stays visible through
 * the middle and the layers keep their transparency rather than stacking into
 * an opaque wash.
 */
export function FloatingMotes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {MOTES.map((mote, i) => (
        <span
          key={i}
          className="mote"
          style={{
            left: mote.left,
            width: mote.size,
            height: mote.size,
            animationDuration: `calc(var(--beat) * ${mote.beats})`,
            animationDelay: `calc(var(--beat) * ${mote.delay})`,
            ['--mote-alpha' as string]: String(mote.alpha),
            ['--mote-drift' as string]: mote.drift,
          }}
        />
      ))}
    </div>
  );
}
