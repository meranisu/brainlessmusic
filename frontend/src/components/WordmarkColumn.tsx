interface WordmarkColumnProps {
  /** Type size — any CSS length. Sets the column's width as well as its height. */
  size: string;
  /** Beats one full pass takes. Give sibling columns co-prime values. */
  beats: number;
  /** Beats to start in, so siblings never march in step. */
  offset?: number;
  /** Outline color. Omit to draw the column solid, in the lockup's two tones. */
  stroke?: string;
  /** Where the column sits — `left-[18%]`, `right-[2%]`, and so on. */
  className?: string;
  /**
   * Climb downward instead of up. Counter-scrolling neighbours are what make a
   * flat field of type read as two planes passing each other rather than as
   * one sheet sliding.
   */
  reverse?: boolean;
}

/**
 * One instance of the sideways wordmark. Hollow keeps whatever is behind it
 * visible through the letterforms, so the layer underneath keeps its depth
 * instead of being papered over. Flat color only, no blur or glow.
 */
/** The lockup itself — hollow if given a stroke, two-tone if not. */
function Lettering({ stroke }: { stroke?: string }) {
  if (!stroke) {
    return (
      <>
        <span className="text-blue-200/15">brainless</span>
        <span className="text-orange-600/25">music</span>
      </>
    );
  }
  return (
    <span
      className="text-transparent"
      style={{
        // Stroke in em, not px — at these sizes a fixed hairline would
        // vanish on a large display.
        WebkitTextStrokeWidth: '0.012em',
        WebkitTextStrokeColor: stroke,
      }}
    >
      brainlessmusic
    </span>
  );
}

function Word({ size, stroke }: { size: string; stroke?: string }) {
  return (
    <p
      className="whitespace-nowrap leading-none tracking-tighter [writing-mode:vertical-rl]"
      style={{ fontSize: size }}
    >
      <Lettering stroke={stroke} />
    </p>
  );
}

/**
 * One screen-width run of the lockup, laid out along the line.
 *
 * `REPEATS` has to be enough that a single run is wider than the viewport,
 * because the seamless loop below shifts by exactly one run and any shortfall
 * shows as a gap crossing the screen. It holds at any window size without
 * measuring anything, because the type is sized in `vw`: a wider screen gets
 * proportionally wider letters, so the number of them it takes to cross stays
 * put.
 */
const REPEATS = 8;

function WordRun({ size, stroke }: { size: string; stroke?: string }) {
  return (
    <p
      className="flex shrink-0 items-center gap-[0.6em] whitespace-nowrap leading-none tracking-tighter"
      style={{ fontSize: size }}
    >
      {Array.from({ length: REPEATS }).map((_, i) => (
        <span key={i} className="flex items-center gap-[0.6em]">
          <Lettering stroke={stroke} />
          {/* A separator, so a row of them reads as a marquee rather than as
              one very long nonsense word. */}
          <span aria-hidden style={{ color: stroke ?? 'rgba(59,130,246,0.18)' }}>
            ·
          </span>
        </span>
      ))}
    </p>
  );
}

/**
 * A column of the wordmark set on its side, climbing forever. Used at poster
 * scale on the title screen and dialled right down as ambient texture behind
 * the app frame.
 *
 * The pass length is in beats rather than seconds, so every column shares the
 * `--beat` clock with the rest of the screen. Sibling columns want co-prime
 * beat counts and an offset — matching laps read as a loop, mismatched ones
 * read as endless.
 */
export function WordmarkColumn({
  size,
  beats,
  offset = 0,
  stroke,
  className = '',
  reverse = false,
}: WordmarkColumnProps) {
  return (
    <div className={`absolute top-0 bottom-0 ${className}`}>
      {/* Two copies, and the loop shifts by exactly one of them — so the seam
          lands on an identical frame whatever the type happens to measure. */}
      <div
        className="animate-wordmark-scroll"
        style={{
          animationDuration: `calc(var(--beat) * ${beats})`,
          animationDelay: `calc(var(--beat) * ${offset})`,
          animationDirection: reverse ? 'reverse' : undefined,
        }}
      >
        <Word size={size} stroke={stroke} />
        <Word size={size} stroke={stroke} />
      </div>
    </div>
  );
}

interface WordmarkBandProps {
  /** Type size — any CSS length. */
  size: string;
  /** Beats one full pass takes. Give sibling bands co-prime values. */
  beats: number;
  /** Beats to start in, so siblings never cross the screen together. */
  offset?: number;
  /** Outline color. Omit to draw solid, in the lockup's two tones. */
  stroke?: string;
  /** Where the band sits vertically — `top-[22%]`, `bottom-[8%]`, and so on. */
  className?: string;
  /** Travel left-to-right instead of right-to-left. */
  reverse?: boolean;
}

/**
 * The wordmark crawling sideways across the screen, the way a marquee does.
 *
 * The columns were the whole backdrop until now, and a field of vertical type
 * has a grain but no direction — the eye reads it as texture and stops
 * noticing. A band that travels the full width gives it something to follow,
 * which is the difference between a patterned wall and a screen that is doing
 * something. Two of them at different heights, speeds and directions, so they
 * cross rather than march.
 *
 * Set in the same hollow outline as the columns and masked by the same
 * `.shell-backdrop` rule, so it is at its faintest exactly where the content
 * column sits and only fully itself out in the gutters. A band that crossed a
 * track list at full strength would be a bug, not decoration.
 */
export function WordmarkBand({
  size,
  beats,
  offset = 0,
  stroke,
  className = '',
  reverse = false,
}: WordmarkBandProps) {
  return (
    <div className={`absolute right-0 left-0 overflow-hidden ${className}`}>
      {/* `w-max` so the pair is as wide as its contents rather than as wide as
          the screen — the -50% shift is only seamless if the two copies are
          the sole thing being measured. */}
      <div
        className="animate-wordmark-crawl flex w-max"
        style={{
          animationDuration: `calc(var(--beat) * ${beats})`,
          animationDelay: `calc(var(--beat) * ${offset})`,
          animationDirection: reverse ? 'reverse' : undefined,
        }}
      >
        <WordRun size={size} stroke={stroke} />
        <WordRun size={size} stroke={stroke} />
      </div>
    </div>
  );
}
