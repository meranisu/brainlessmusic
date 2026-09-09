import type { CSSProperties } from 'react';

const COLS = 6;
const ROWS = 9;
const SQUARE_COUNT = COLS * ROWS;

function MosaicGrid() {
  return (
    <div className="grid h-1/2 w-full" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
      {Array.from({ length: SQUARE_COUNT }).map((_, i) => {
        const shade =
          i % 7 === 0 ? 'bg-blue-700' : i % 4 === 0 ? 'bg-blue-800' : i % 5 === 0 ? 'bg-[#0c1a52]' : 'bg-blue-900';
        // How far along the wavefront this tile sits: 0 at the top-left
        // corner, 1 at the bottom-right. Fed back as a negative delay, so a
        // later tile is simply further into the same loop.
        const wave = (((i % COLS) / COLS + Math.floor(i / COLS) / ROWS) / 2).toFixed(3);
        return (
          <div
            key={i}
            className={`beat-tile border border-blue-500/30 ${shade}`}
            style={{ '--beat-offset': `-${wave}` } as CSSProperties}
          />
        );
      })}
    </div>
  );
}

/**
 * Two columns, each one word tall at poster scale, running different laps of
 * the same loop. Their durations share no common factor worth speaking of and
 * one starts eleven beats in, so the pair never realigns — the panel reads as
 * an endless scroll rather than something that resets.
 *
 * Sized against both axes: the type wants to be enormous, but a column wider
 * than half the panel leaves no room for the second one.
 */
const WORDMARK_COLUMNS = [
  { left: '18%', beats: 34, offset: 0, hollow: true },
  { left: '56%', beats: 53, offset: -11, hollow: false },
];

const WORD_SIZE = 'clamp(6rem, 30vh, 23vw)';

/**
 * One instance of the sideways wordmark. Hollow keeps the mosaic and its beat
 * flashes visible through the letterforms, so the panel keeps its depth
 * instead of being papered over; the solid column echoes the lockup's two
 * tones. Flat color only, no blur or glow.
 */
function Word({ hollow }: { hollow: boolean }) {
  return (
    <p
      className="whitespace-nowrap leading-none tracking-tighter [writing-mode:vertical-rl]"
      style={{ fontSize: WORD_SIZE }}
    >
      {hollow ? (
        <span
          className="text-transparent"
          style={{
            // Stroke in em, not px — at this size a fixed hairline would
            // vanish on a large display.
            WebkitTextStrokeWidth: '0.012em',
            WebkitTextStrokeColor: 'rgba(219, 234, 254, 0.42)',
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
 * Decorative panel confined to the right half of the screen — a vertically
 * scrolling mosaic of flat navy squares behind two oversized columns of
 * sideways wordmark, echoing the reference's composition (content band + a
 * side panel of scrolling geometric graphics), not its specific content.
 *
 * The mosaic is beat-driven: a wavefront crosses the grid once per beat and
 * burns orange on the downbeat. Tempo, scroll and flash all come from the
 * single `--beat` custom property in index.css, so the panel reads as timed
 * rather than merely animated. The wordmark columns climb faster than the
 * mosaic beneath them — the nearer layer moves more, which is the whole trick
 * to making two flat planes read as depth.
 *
 * `aria-hidden` + `pointer-events-none` — decoration only.
 */
export function TitleScreenPanel() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 w-1/2 overflow-hidden"
      style={{
        // Feather the inner edge so the mosaic dissolves toward the sign-in
        // side instead of stopping dead on the half-way line. Above and below
        // the content band there is no white to hide that seam, so the panel
        // has to soften it itself.
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 34%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 34%)',
      }}
    >
      <div className="animate-mosaic-scroll relative h-[200%] w-full">
        <MosaicGrid />
        <MosaicGrid />
      </div>
      {WORDMARK_COLUMNS.map((col) => (
        <div key={col.left} className="absolute top-0 bottom-0" style={{ left: col.left }}>
          {/* Two copies, and the loop shifts by exactly one of them — so the
              seam lands on an identical frame whatever the type measures. */}
          <div
            className="animate-wordmark-scroll"
            style={{
              animationDuration: `calc(var(--beat) * ${col.beats})`,
              animationDelay: `calc(var(--beat) * ${col.offset})`,
            }}
          >
            <Word hollow={col.hollow} />
            <Word hollow={col.hollow} />
          </div>
        </div>
      ))}
    </div>
  );
}
