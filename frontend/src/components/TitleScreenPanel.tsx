const COLS = 6;
const ROWS = 9;
const SQUARE_COUNT = COLS * ROWS;

// Own abstract shape — a soundwave silhouette, not the reference's bird/wing.
// Halftone dot-matrix fill via radial-gradient, same technique as the
// reference, clipped to a jagged EQ-bar-like polygon instead.
const SOUNDWAVE_CLIP =
  'polygon(6% 100%, 6% 62%, 20% 62%, 20% 34%, 34% 34%, 34% 78%, 48% 78%, 48% 12%, 62% 12%, 62% 54%, 76% 54%, 76% 26%, 90% 26%, 90% 90%, 100% 90%, 100% 100%)';

function MosaicGrid() {
  return (
    <div className="grid h-1/2 w-full" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
      {Array.from({ length: SQUARE_COUNT }).map((_, i) => {
        const shade =
          i % 7 === 0 ? 'bg-blue-700' : i % 4 === 0 ? 'bg-blue-800' : i % 5 === 0 ? 'bg-[#0c1a52]' : 'bg-blue-900';
        return <div key={i} className={`border border-blue-500/30 ${shade}`} />;
      })}
    </div>
  );
}

/**
 * Decorative panel confined to the right half of the screen — a vertically
 * scrolling mosaic of flat navy squares plus a halftone dot-matrix
 * silhouette, echoing the reference's composition (content band + a side
 * panel of scrolling geometric graphics), not its specific content.
 * `aria-hidden` + `pointer-events-none` — decoration only.
 */
export function TitleScreenPanel() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-1/2 overflow-hidden">
      <div className="animate-mosaic-scroll relative h-[200%] w-full">
        <MosaicGrid />
        <MosaicGrid />
      </div>
      <div
        className="absolute inset-4 sm:inset-10"
        style={{
          backgroundImage: 'radial-gradient(circle, white 1.5px, transparent 1.5px)',
          backgroundSize: '8px 8px',
          clipPath: SOUNDWAVE_CLIP,
          opacity: 0.9,
        }}
      />
    </div>
  );
}
