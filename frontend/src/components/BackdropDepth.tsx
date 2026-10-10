import { WordmarkBand, WordmarkColumn } from './WordmarkColumn';

/** Depth without more type: something curved (the ring) and something with parallax (the motes). */

const RING_BANDS = [
  // inset, tilt on X, how long one turn takes in beats, and how bright.
  { inset: '0%', tilt: 68, beats: 340, alpha: 0.44 },
  { inset: '9%', tilt: 74, beats: 289, alpha: 0.32 },
  { inset: '19%', tilt: 61, beats: 233, alpha: 0.38 },
  { inset: '31%', tilt: 79, beats: 181, alpha: 0.24 },
];

/**
 * A tilted orange ring turning in real 3D, so its near edge passes closer than its far one. Bands turn at co-prime beat
 * counts and never repeat a pose. The backdrop's only orange, tying it to the accent.
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

/** Fixed positions and timings: `Math.random()` in render would reshuffle on every render. */
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

/** Hollow circles drifting up and sideways; the second axis keeps the columns from reading as sliding blinds. */
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
 * Three tiers of type at different sizes and speeds; the near one bigger, brighter and quicker. Durations are co-prime
 * beat counts, so columns never line up and keep time with the title screen.
 */
const FAR_SIZE = 'clamp(2.5rem, 8vh, 5vw)';
const MID_SIZE = 'clamp(3.5rem, 12.5vh, 8vw)';
const NEAR_SIZE = 'clamp(5.5rem, 20vh, 13vw)';

/* Defined in CSS (`:root` in `index.css`) so themes can override them. */
const FAR_STROKE = 'var(--backdrop-far)';
const MID_STROKE = 'var(--backdrop-mid)';
const NEAR_STROKE = 'var(--backdrop-near)';

/** The crawling bands, sized between the tiers and stroked faint: they cross the reading area. */
const BAND_SIZE = 'clamp(3.5rem, 13vh, 8vw)';
const BAND_STROKE = 'var(--backdrop-band)';

/**
 * The moving backdrop, full-bleed, with a mask (`.shell-backdrop`) dimming the content column. Inner columns drop
 * below `md`. Shared by AppShell and AccountSelectPage; `vivid` loosens the mask.
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

      {/* Far tier: small, faint, slow, climbing. */}
      <WordmarkColumn className="left-[-3%]" size={FAR_SIZE} beats={128} stroke={FAR_STROKE} />
      <WordmarkColumn
        className="left-[43%] hidden lg:block"
        size={FAR_SIZE}
        beats={97}
        offset={-31}
        stroke={FAR_STROKE}
      />
      <WordmarkColumn className="right-[-3%]" size={FAR_SIZE} beats={113} offset={-17} stroke={FAR_STROKE} />

      {/* Middle tier. */}
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

      {/* Near tier: larger, brighter, quicker, falling. */}
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

      {/* Two bands crossing in opposite directions, placed high and low to stay off the content. All beat counts
          here are co-prime, so nothing comes back into step. */}
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
