import type { CSSProperties } from 'react';
import { WordmarkColumn } from './WordmarkColumn';

const COLS = 6;
const ROWS = 9;
const SQUARE_COUNT = COLS * ROWS;

/**
 * Two columns at poster scale, running different laps of the same loop. Their
 * durations share no common factor worth speaking of and one starts eleven
 * beats in, so the pair only realigns after about twelve minutes — the panel
 * reads as an endless scroll rather than something that resets.
 *
 * Sized against both axes: the type wants to be enormous, but a column wider
 * than half the panel leaves no room for the second one.
 */
const WORD_SIZE = 'clamp(6rem, 30vh, 23vw)';

function MosaicGrid() {
  return (
    <div className="grid h-1/2 w-full" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
      {Array.from({ length: SQUARE_COUNT }).map((_, i) => {
        const shade =
          i % 7 === 0
            ? 'bg-blue-700'
            : i % 4 === 0
              ? 'bg-blue-800'
              : i % 5 === 0
                ? 'bg-[var(--app-ground)]'
                : 'bg-blue-900';
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
export function TitleScreenPanel({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      // `w-1/2` is the resting width; the exit animation overrides it to open
      // the panel out to the full screen, so the last thing visible before
      // black is the background rather than the furniture in front of it.
      className={`pointer-events-none absolute inset-y-0 right-0 w-1/2 overflow-hidden ${className}`}
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
      <WordmarkColumn
        className="left-[18%]"
        size={WORD_SIZE}
        beats={34}
        stroke="color-mix(in oklab, var(--color-blue-200) 42%, transparent)"
      />
      <WordmarkColumn className="left-[56%]" size={WORD_SIZE} beats={53} offset={-11} />
    </div>
  );
}
