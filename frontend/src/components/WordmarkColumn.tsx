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
}

/**
 * One instance of the sideways wordmark. Hollow keeps whatever is behind it
 * visible through the letterforms, so the layer underneath keeps its depth
 * instead of being papered over. Flat color only, no blur or glow.
 */
function Word({ size, stroke }: { size: string; stroke?: string }) {
  return (
    <p
      className="whitespace-nowrap leading-none tracking-tighter [writing-mode:vertical-rl]"
      style={{ fontSize: size }}
    >
      {stroke ? (
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
      ) : (
        <>
          <span className="text-blue-200/15">brainless</span>
          <span className="text-orange-600/25">music</span>
        </>
      )}
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
export function WordmarkColumn({ size, beats, offset = 0, stroke, className = '' }: WordmarkColumnProps) {
  return (
    <div className={`absolute top-0 bottom-0 ${className}`}>
      {/* Two copies, and the loop shifts by exactly one of them — so the seam
          lands on an identical frame whatever the type happens to measure. */}
      <div
        className="animate-wordmark-scroll"
        style={{
          animationDuration: `calc(var(--beat) * ${beats})`,
          animationDelay: `calc(var(--beat) * ${offset})`,
        }}
      >
        <Word size={size} stroke={stroke} />
        <Word size={size} stroke={stroke} />
      </div>
    </div>
  );
}
