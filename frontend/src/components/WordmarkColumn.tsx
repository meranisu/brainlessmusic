interface WordmarkColumnProps {
  /** Type size, any CSS length. Sets the column's width and height. */
  size: string;
  /** Beats one full pass takes. Give sibling columns co-prime values. */
  beats: number;
  /** Beats to start in, so siblings never march in step. */
  offset?: number;
  /** Outline color. Omit to draw the column solid, in the lockup's two tones. */
  stroke?: string;
  /** Position, e.g. `left-[18%]`. */
  className?: string;
  /** Climb downward. Counter-scrolling neighbours read as two planes passing. */
  reverse?: boolean;
}

/** One sideways wordmark. Hollow, so the layer behind stays visible. Flat color, no blur or glow. */
/** The lockup: hollow with a stroke, two-tone without. */
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
        // In em: a fixed hairline would vanish at these sizes.
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

/** Copies per run. A run must be wider than the viewport for the loop to be seamless; `vw` type keeps that true. */
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
          <span
            aria-hidden
            style={{ color: stroke ?? 'color-mix(in oklab, var(--color-blue-500) 18%, transparent)' }}
          >
            ·
          </span>
        </span>
      ))}
    </p>
  );
}

/** A sideways wordmark column climbing forever, timed in beats. Siblings want co-prime beat counts and an offset. */
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
      {/* Two copies; the loop shifts by exactly one, so the seam is an identical frame. */}
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
  /** Type size, any CSS length. */
  size: string;
  /** Beats one full pass takes. Give sibling bands co-prime values. */
  beats: number;
  /** Beats to start in, so siblings never cross the screen together. */
  offset?: number;
  /** Outline color. Omit to draw solid, in the lockup's two tones. */
  stroke?: string;
  /** Vertical position, e.g. `top-[22%]`. */
  className?: string;
  /** Travel left-to-right instead of right-to-left. */
  reverse?: boolean;
}

/**
 * The wordmark crawling sideways like a marquee, so the field has a direction to follow. Same hollow outline and
 * `.shell-backdrop` mask as the columns, so it is faintest over the content.
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
      {/* `w-max`, so the -50% shift measures only the two copies. */}
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
