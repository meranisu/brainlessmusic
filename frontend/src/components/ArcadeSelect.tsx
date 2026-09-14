import { useCallback, useEffect, useRef, useState, type WheelEvent } from 'react';
import { CoverArt } from './CoverArt';
import { FavoriteButton } from './FavoriteButton';
import { PlayIcon } from './icons';
import { formatDuration } from '../lib/format';
import type { TrackSummary } from '../types/api';

/**
 * The height of one entry, in pixels.
 *
 * A fixed number rather than a measurement, because the strip's whole geometry
 * is arithmetic on it: the offset that centres the selection, the number of
 * rows a page-jump moves, and how far the list has to travel. Measuring
 * instead would mean a layout read on every selection change, and a row that is
 * one pixel taller on one platform would slowly drift the cursor off centre.
 */
export const ROW_HEIGHT = 68;

interface ArcadeSelectProps {
  tracks: TrackSummary[];
  /** Favourited ids, fetched once by the page rather than per row. */
  favoriteIds: Set<number>;
  selected: number;
  onSelect: (index: number) => void;
  onPlay: (index: number) => void;
  /** True while another page is on its way, for the strip's tail. */
  isLoadingMore?: boolean;
  /** Called when the selection nears the end of what has been loaded. */
  onNearEnd?: () => void;
}

/**
 * The music select, after the reference: names on the right, the chosen one
 * written large on the left.
 *
 * The detail that makes it feel like the reference is that **the cursor does
 * not move — the list does.** The selected entry is pinned to the middle of the
 * strip and everything else slides past it. A cursor walking down a static list
 * is a file browser; a list travelling under a fixed cursor is a machine
 * offering you things, and it is the same difference as between a menu and a
 * dial.
 */
export function ArcadeSelect({
  tracks,
  favoriteIds,
  selected,
  onSelect,
  onPlay,
  isLoadingMore = false,
  onNearEnd,
}: ArcadeSelectProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripHeight, setStripHeight] = useState(0);

  // The strip's height decides where the middle is, and it changes with the
  // window. Observed rather than read once, because a rotated phone would
  // otherwise leave the cursor off-centre until something else forced a render.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStripHeight(entry.contentRect.height));
    observer.observe(el);
    setStripHeight(el.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!onNearEnd) return;
    if (tracks.length > 0 && selected >= tracks.length - 8) onNearEnd();
  }, [selected, tracks.length, onNearEnd]);

  const current = tracks[selected];

  /**
   * The wheel changes the selection rather than scrolling the strip.
   *
   * That is the arcade behaviour — the reference has a turntable, and one notch
   * of it is one song — and it is also the only behaviour consistent with a
   * fixed cursor: free scrolling would let the list and the selection disagree
   * about what is in the middle, and then a click would select something the
   * cursor was not on.
   */
  const onWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const step = event.deltaY > 0 ? 1 : -1;
      const next = Math.min(Math.max(selected + step, 0), tracks.length - 1);
      if (next !== selected) onSelect(next);
    },
    [selected, tracks.length, onSelect],
  );

  // Where the list has to sit for the selected row to land in the middle.
  const offset = stripHeight / 2 - ROW_HEIGHT / 2 - selected * ROW_HEIGHT;

  return (
    <div className="arcade-select grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      {/* ── The chosen one, written large ─────────────────────────────── */}
      <div className="arcade-detail order-2 min-w-0 lg:order-1">
        {current ? (
          <div key={current.id} className="arcade-detail-inner">
            <CoverArt
              kind="tracks"
              id={current.id}
              className="aspect-square w-full max-w-72 rounded-xl border border-blue-700"
            />
            <h2 className="mt-5 text-2xl font-semibold leading-tight text-white lg:text-3xl">
              {current.title}
            </h2>
            <p className="mt-1 text-base text-blue-200">{current.artist ?? 'Unknown artist'}</p>
            <p className="text-sm text-blue-400">{current.album ?? 'No album'}</p>

            <dl className="mt-5 grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Fact label="Length" value={formatDuration(current.duration)} />
              <Fact label="Format" value={current.format ?? '—'} />
              <Fact label="Plays" value={current.playCount > 0 ? String(current.playCount) : '—'} />
              <Fact
                label="Status"
                value={current.missing ? 'File missing' : current.hidden ? 'Hidden' : 'Ready'}
              />
            </dl>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => onPlay(selected)}
                disabled={current.missing}
                className="btn-primary btn-md min-h-12 gap-2 px-6 text-base font-semibold uppercase tracking-[0.12em]"
              >
                <PlayIcon className="h-3.5 w-3.5" />
                Play
              </button>
              <FavoriteButton trackId={current.id} isFavorited={favoriteIds.has(current.id)} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-blue-300">Nothing here yet.</p>
        )}
      </div>

      {/* ── The strip ─────────────────────────────────────────────────── */}
      <div className="order-1 lg:order-2">
        <div ref={stripRef} className="arcade-strip" onWheel={onWheel}>
          {/* The cursor. A fixed band the list travels under, rather than a
              highlight that moves — which is the whole point of the layout, and
              the reason it is a sibling of the list instead of a class on a
              row. */}
          <div aria-hidden className="arcade-cursor" style={{ height: ROW_HEIGHT }} />

          <div
            className="arcade-rail"
            style={{ transform: `translateY(${offset}px)` }}
          >
            {tracks.map((track, i) => (
              <button
                key={track.id}
                // A click selects; a click on what is already selected plays.
                // Two gestures on one control, distinguished by where the
                // cursor already is, which is how the reference's single button
                // does confirm.
                onClick={() => (i === selected ? onPlay(i) : onSelect(i))}
                style={{ height: ROW_HEIGHT }}
                className={`arcade-row ${i === selected ? 'is-selected' : ''} ${
                  track.missing ? 'is-missing' : ''
                }`}
              >
                <span className="arcade-row-title">{track.title}</span>
                <span className="arcade-row-meta">
                  <span className="truncate">{track.artist ?? 'Unknown artist'}</span>
                  {track.format && <span className="arcade-row-format">{track.format}</span>}
                </span>
              </button>
            ))}
            {isLoadingMore && (
              <p
                style={{ height: ROW_HEIGHT }}
                className="flex items-center px-4 text-xs uppercase tracking-[0.2em] text-blue-400"
              >
                Loading…
              </p>
            )}
          </div>
        </div>

        <p className="mt-2 px-1 text-xs text-blue-400">
          {tracks.length > 0 ? `${selected + 1} of ${tracks.length} loaded` : ''}
        </p>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-blue-400">{label}</dt>
      <dd className="text-right text-blue-100">{value}</dd>
    </>
  );
}
