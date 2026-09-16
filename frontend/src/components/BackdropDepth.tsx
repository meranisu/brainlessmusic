import { WordmarkBand, WordmarkColumn } from './WordmarkColumn';

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

/**
 * Two tiers, at different sizes and speeds, running in opposite directions.
 *
 * That is the whole trick: a single sheet of scrolling type reads as a sheet
 * of scrolling type. Two of them passing each other at different rates reads
 * as depth, and costs nothing extra — the near tier is bigger, brighter and
 * quicker, which is what "nearer" means to an eye.
 *
 * Beat counts are co-prime so no two columns ever line up and the field never
 * visibly loops. Every duration is in beats rather than seconds, so this keeps
 * time with the title screen and the player.
 *
 * Three sizes rather than two. With only a far and a near tier the field reads
 * as two planes; a middle one turns it into a gradient of distance, and it is
 * the cheapest way to make the same number of elements look like more depth.
 */
const FAR_SIZE = 'clamp(2.5rem, 8vh, 5vw)';
const MID_SIZE = 'clamp(3.5rem, 12.5vh, 8vw)';
const NEAR_SIZE = 'clamp(5.5rem, 20vh, 13vw)';

/* Named in CSS rather than written here, so a theme can reach them. A colour
   inlined in a component is a colour no `[data-theme]` selector can override,
   which is precisely how a red theme ends up with a blue backdrop. The values
   and the reasoning for them live on `:root` in `index.css`. */
const FAR_STROKE = 'var(--backdrop-far)';
const MID_STROKE = 'var(--backdrop-mid)';
const NEAR_STROKE = 'var(--backdrop-near)';

/**
 * The crawling bands. Sized between the two column tiers so they belong to the
 * same field rather than sitting in front of it, and stroked at the far tier's
 * weight — they cross the whole screen, including the part with the reading on
 * it, so they are the layer that can least afford to be loud.
 */
const BAND_SIZE = 'clamp(3.5rem, 13vh, 8vw)';
const BAND_STROKE = 'var(--backdrop-band)';

/**
 * The app's moving backdrop. Full-bleed since 2026-09-11; it used to be two
 * columns confined to the gutters and hidden below `2xl`, for the good reason
 * that decoration behind a data table is a bug rather than a feature.
 *
 * Going full-bleed keeps that constraint and answers it with a mask instead of
 * a breakpoint: `.shell-backdrop` holds the middle of the screen — where the
 * content column actually sits — at a fraction of the strength it has in the
 * gutters. Motion is visible everywhere, and loudest where there is nothing to
 * read. The measured cost to a track row is in the change log; it is under a
 * unit of colour per channel.
 *
 * Below `md` the inner columns drop out. A phone has no gutters, so every
 * column there is behind the text, and three of them is clutter rather than
 * depth.
 *
 * Shared by `AppShell` and `AccountSelectPage` — both are screens with a
 * column of readable content in the middle and nothing else to say about
 * their background, which is exactly what this was built for.
 *
 * `vivid` loosens the centre mask that normally holds the backdrop down
 * behind readable content (see `.shell-backdrop` in index.css). `AppShell`
 * sits a dense track list on top of it and needs that restraint; the account
 * select screen has two cards and a lot of open ground, and can afford the
 * backdrop being the more obviously "alive" thing it was always animating to
 * be.
 */
export function ShellBackdrop({ vivid = false }: { vivid?: boolean }) {
  return (
    <div
      aria-hidden
      className={`shell-backdrop pointer-events-none fixed inset-0 z-0 overflow-hidden ${
        vivid ? 'shell-backdrop-vivid' : ''
      }`}
    >
      {/* Deepest. Behind every piece of type, and the only orange back here. */}
      <SpinRing />

      {/* Far tier — small, faint, slow, climbing. */}
      <WordmarkColumn className="left-[-3%]" size={FAR_SIZE} beats={128} stroke={FAR_STROKE} />
      <WordmarkColumn
        className="left-[43%] hidden lg:block"
        size={FAR_SIZE}
        beats={97}
        offset={-31}
        stroke={FAR_STROKE}
      />
      <WordmarkColumn className="right-[-3%]" size={FAR_SIZE} beats={113} offset={-17} stroke={FAR_STROKE} />

      {/* Middle tier — the one that turns two planes into a sense of distance. */}
      <WordmarkColumn
        className="left-[9%] hidden xl:block"
        size={MID_SIZE}
        beats={83}
        offset={-53}
        stroke={MID_STROKE}
        reverse
      />
      <WordmarkColumn
        className="left-[57%] hidden xl:block"
        size={MID_SIZE}
        beats={103}
        offset={-11}
        stroke={MID_STROKE}
      />

      {/* Motes drift through the type rather than behind it, so they cross in
          front of some columns and behind others. */}
      <FloatingMotes />

      {/* Near tier — larger, brighter, quicker, and falling against the rest. */}
      <WordmarkColumn
        className="left-[19%] hidden md:block"
        size={NEAR_SIZE}
        beats={67}
        stroke={NEAR_STROKE}
        reverse
      />
      <WordmarkColumn
        className="left-[68%] hidden md:block"
        size={NEAR_SIZE}
        beats={53}
        offset={-23}
        stroke={NEAR_STROKE}
        reverse
      />

      {/* Two bands crossing the columns, in opposite directions and at
          different heights. The columns give the field a grain; a grain has no
          direction, and after a few seconds the eye stops reading it as motion
          at all. Something travelling the full width is what it follows.

          Placed high and low on purpose — off the vertical middle, where the
          content sits and where a line crossing the reading would be a bug
          rather than decoration. Every beat count in this backdrop is co-prime
          with every other (128/97/113/83/103/67/53/149/181, and the ring's
          340/289/233/181), so nothing ever comes back into step. */}
      <WordmarkBand
        className="top-[14%]"
        size={BAND_SIZE}
        beats={149}
        stroke={BAND_STROKE}
      />
      <WordmarkBand
        className="bottom-[16%]"
        size={BAND_SIZE}
        beats={181}
        offset={-41}
        stroke={BAND_STROKE}
        reverse
      />
    </div>
  );
}
