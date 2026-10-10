import type { ReactNode } from 'react';

/** Varied so a column of bars reads as names of different lengths, not a stack of identical stripes. */
const TITLE_WIDTHS = ['w-2/5', 'w-3/5', 'w-1/3', 'w-1/2', 'w-2/3', 'w-1/4', 'w-5/12', 'w-7/12'];
const META_WIDTHS = ['w-24', 'w-16', 'w-20', 'w-28'];

function Bar({ className }: { className: string }) {
  return <span className={`skeleton block ${className}`} />;
}

/**
 * The loading state for a page, shaped like what is coming. Held back about 300 ms (`.skeleton-delay`) so a fast
 * load never flashes it. Screen readers get `label`; the blocks themselves are hidden from them.
 */
export function Skeleton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" className="skeleton-delay flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}

/** Matches the Artists and Playlists lists: a name on the left, counts on the right. */
export function SkeletonListRows({ rows = 8 }: { rows?: number }) {
  return (
    <ul className="card divide-y divide-blue-800/60 overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5">
          <span className="min-w-0 flex-1">
            <Bar className={`h-3.5 ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`} />
          </span>
          <Bar className={`h-3 shrink-0 ${META_WIDTHS[i % META_WIDTHS.length]}`} />
        </li>
      ))}
    </ul>
  );
}

/** Matches `AlbumGrid`, including its column counts, so the covers land where the real ones will. */
export function SkeletonAlbumGrid({ count = 10, showArtist = true }: { count?: number; showArtist?: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-2 p-2">
          <Bar className="aspect-square w-full rounded-md" />
          <span className="flex flex-col gap-1.5 pt-0.5">
            <Bar className={`h-3.5 ${i % 2 ? 'w-3/4' : 'w-1/2'}`} />
            {showArtist && <Bar className={`h-3 ${i % 3 ? 'w-1/2' : 'w-2/3'}`} />}
            <Bar className="h-3 w-1/3" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Matches the track tables (album, playlist, favorites, search): title, artist, duration. `bare` drops the card for
    a panel that already has its own frame, like the Full view. */
export function SkeletonTrackRows({
  rows = 10,
  cover = false,
  bare = false,
}: {
  rows?: number;
  cover?: boolean;
  bare?: boolean;
}) {
  return (
    <div className={`${bare ? '' : 'card overflow-hidden'} divide-y divide-blue-800/60`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`flex items-center gap-3 px-4 ${cover ? 'py-2.5' : 'py-3.5'}`}>
          {cover && <Bar className="h-9 w-9 shrink-0 rounded-md" />}
          <span className="min-w-0 flex-1">
            <Bar className={`h-3.5 ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`} />
          </span>
          <span className="hidden w-1/4 sm:block">
            <Bar className={`h-3 ${i % 2 ? 'w-2/3' : 'w-1/2'}`} />
          </span>
          <Bar className="h-3 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** The heading block of a detail page. `cover` adds the album-sized art and the play button beside it. */
export function SkeletonDetailHeader({ cover = false }: { cover?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      {cover && <Bar className="h-40 w-40 shrink-0 rounded-md" />}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <Bar className="h-3 w-14" />
        <Bar className="h-7 w-2/3 max-w-sm" />
        <Bar className="h-3.5 w-1/2 max-w-xs" />
        {cover && <Bar className="mt-1.5 h-9 w-32 rounded-lg" />}
      </div>
    </div>
  );
}

/** Matches the Library's Simple view: the chosen track's art and stats, and the strip of titles. */
export function SkeletonArcade() {
  return (
    <div className="arcade-select">
      <div className="arcade-detail order-2 flex min-w-0 flex-col gap-4 lg:order-1 lg:flex-1">
        <div className="flex items-end gap-4">
          <Bar className="arcade-detail-art rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <Bar className="h-7 w-3/4" />
            <Bar className="h-4 w-1/2" />
          </div>
        </div>
        <div className="flex gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Bar key={i} className="h-12 flex-1 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="arcade-rail-col order-1 lg:order-2">
        <div className="card flex min-h-0 flex-1 flex-col divide-y divide-blue-800/60 overflow-hidden">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5 px-4 py-3">
              <Bar className={`h-3.5 ${TITLE_WIDTHS[i % TITLE_WIDTHS.length]}`} />
              <Bar className={`h-2.5 ${META_WIDTHS[i % META_WIDTHS.length]}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
