import type { CSSProperties } from 'react';
import { WordmarkColumn } from './WordmarkColumn';

const COLS = 6;
const ROWS = 9;
const SQUARE_COUNT = COLS * ROWS;

/** Two poster-scale columns on laps that realign only after about twelve minutes, so the scroll never visibly resets. */
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
        // Position along the wavefront (0 top-left, 1 bottom-right), used as a negative delay.
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
 * The right-half panel: a scrolling mosaic, lit by a beat wavefront that burns orange on the downbeat, behind two
 * sideways wordmark columns that climb faster for depth. All timing comes from `--beat`. Decoration only.
 */
export function TitleScreenPanel({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      // The exit animation widens this to full screen, so the background is the last thing seen.
      className={`pointer-events-none absolute inset-y-0 right-0 w-1/2 overflow-hidden ${className}`}
      style={{
        // Feather the inner edge; above and below the white band nothing else hides the seam.
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
