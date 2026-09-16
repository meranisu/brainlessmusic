import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { CoverArt } from './CoverArt';
import { FavoriteButton } from './FavoriteButton';
import { PlayIcon } from './icons';
import { formatDate, formatDuration } from '../lib/format';
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

/** How far a pointer has to move before a press counts as a drag rather than
 *  a tap — small enough to feel immediate, large enough that a slightly
 *  unsteady tap still reaches the row's click handler instead of the rail. */
const DRAG_THRESHOLD_PX = 6;

/** How long a run of typed letters counts as one word before it resets —
 *  long enough to type a few characters without pausing, short enough that
 *  starting a new search doesn't feel like it's ignoring you. */
const TYPEAHEAD_RESET_MS = 700;

const rowId = (trackId: number) => `arcade-row-${trackId}`;

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

  // Other tracks by the same artist, already sitting in memory — nothing
  // fetched for this, since `tracks` is the same page the strip is already
  // showing. Fills the detail panel with something worth clicking instead of
  // open space, and doubles as a shortcut past however many other artists
  // separate them in the alphabetical strip.
  const moreFromArtist = useMemo(() => {
    if (!current?.artist) return [];
    return tracks.filter((t) => t.artist === current.artist && t.id !== current.id).slice(0, 5);
  }, [tracks, current]);

  // A one-shot confirm flash on the cursor band when a track actually starts
  // playing — distinct from selecting, which is silent (Q23). `null` until
  // the first play, so the flash never plays itself on mount; incrementing
  // rather than toggling a boolean means two plays in a row (skip back onto
  // the same track) each get their own flash via the `key` remount below,
  // the same replay-on-change trick `.arcade-detail-inner` already uses.
  const [launchToken, setLaunchToken] = useState<number | null>(null);
  const play = useCallback(
    (index: number) => {
      setLaunchToken((t) => (t ?? 0) + 1);
      onPlay(index);
    },
    [onPlay],
  );

  // Buffered rather than per-keystroke, so typing "st" narrows past whatever
  // "s" alone would have matched — a ref because the buffer must survive
  // across renders without itself triggering one.
  const typeahead = useRef({ buffer: '', timer: 0 });

  const jumpToLetters = useCallback(
    (char: string) => {
      const state = typeahead.current;
      window.clearTimeout(state.timer);
      state.buffer += char.toLowerCase();
      const buffer = state.buffer;
      state.timer = window.setTimeout(() => {
        typeahead.current.buffer = '';
      }, TYPEAHEAD_RESET_MS);

      // Starts one past the current selection and wraps, so repeating the
      // same letter (or the same short buffer) cycles forward through every
      // title that matches rather than always landing on the first one.
      for (let step = 1; step <= tracks.length; step++) {
        const i = (selected + step) % tracks.length;
        if (tracks[i].title.toLowerCase().startsWith(buffer)) {
          onSelect(i);
          return;
        }
      }
    },
    [tracks, selected, onSelect],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (tracks.length === 0) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          onSelect(Math.min(selected + 1, tracks.length - 1));
          return;
        case 'ArrowUp':
          event.preventDefault();
          onSelect(Math.max(selected - 1, 0));
          return;
        case 'Home':
          event.preventDefault();
          onSelect(0);
          return;
        case 'End':
          event.preventDefault();
          onSelect(tracks.length - 1);
          return;
        case 'Enter':
          event.preventDefault();
          play(selected);
          return;
        default:
          // Plain single characters only — leaves browser/OS shortcuts
          // (Ctrl+F, Alt+Tab, etc.) alone rather than swallowing them.
          // Stopped from bubbling: the player bar has its own global
          // `window` keydown handler for space/n/p (play-pause, next,
          // previous) that only excuses form fields, not this listbox — so
          // typing "n", "p", or a space while searching by title would
          // otherwise also skip or pause the track that's already playing.
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            jumpToLetters(event.key);
          }
      }
    },
    [tracks, selected, onSelect, play, jumpToLetters],
  );

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

  /**
   * Dragging the rail with a mouse or a finger — the one gesture the wheel and
   * the keyboard can't offer, since both are already committed to the "one
   * notch, one row" dial behaviour. A drag is the exception on purpose: the
   * rail follows the pointer continuously while a finger is down, the way a
   * real turntable's platter does, and only snaps to the nearest row on
   * release. Free continuous motion mid-gesture and a discrete, dial-like
   * result are not a contradiction here — they are two different moments of
   * the same interaction.
   *
   * State lives in a ref rather than triggering it through `onSelect`, so a
   * drag in progress does not spam the caller (and everything downstream of
   * `selected`, like near-end pagination) with an index for every pixel of
   * finger travel. Only the release commits a real selection change.
   */
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startSelected: number;
    dragging: boolean;
  } | null>(null);
  const [dragDeltaPx, setDragDeltaPx] = useState(0);
  // Mirrors `dragRef.current.dragging` into render-visible state — the ref
  // itself is the source of truth for event handlers (it must be readable
  // synchronously mid-gesture), but a ref cannot be read during render.
  const [isDragging, setIsDragging] = useState(false);
  // Set the instant a drag crosses the threshold, cleared on the next frame
  // after release — long enough to outlive the synthetic `click` a pointerup
  // generates, which would otherwise re-fire select/play on top of the drag's
  // own result.
  const wasDragging = useRef(false);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || tracks.length === 0) return;
      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startSelected: selected,
        dragging: false,
      };
    },
    [selected, tracks.length],
  );

  // Clamped so the rail cannot be dragged past either end — without this a
  // long drag on a short list would carry a delta that snaps to an
  // out-of-range row the instant the finger lifts. Delta and row move in
  // opposite directions (dragging up — negative delta — reveals *later* rows),
  // so the bound on how far *up* you can drag is set by the rows *left*, and
  // the bound on how far *down* is set by the rows *behind* the start.
  const clampDelta = useCallback(
    (startSelected: number, delta: number) => {
      const minDelta = -(tracks.length - 1 - startSelected) * ROW_HEIGHT;
      const maxDelta = startSelected * ROW_HEIGHT;
      return Math.min(Math.max(delta, minDelta), maxDelta);
    },
    [tracks.length],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const delta = event.clientY - drag.startY;
      if (!drag.dragging) {
        if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
        drag.dragging = true;
        wasDragging.current = true;
        setIsDragging(true);
        event.currentTarget.setPointerCapture(drag.pointerId);
      }
      event.preventDefault();
      setDragDeltaPx(clampDelta(drag.startSelected, delta));
    },
    [clampDelta],
  );

  const endDrag = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.dragging) {
        // Read straight from the event rather than the `dragDeltaPx` state:
        // this handler is recreated on every drag-state change (its deps
        // include callbacks that close over `selected`), and trusting state
        // here would mean trusting that the final `pointermove`'s render had
        // already committed and re-bound this very listener before the
        // browser dispatched `pointerup` — true most of the time, but a race,
        // not a guarantee. The event's own `clientY` has no such race.
        const delta = clampDelta(drag.startSelected, event.clientY - drag.startY);
        // Dragging down reveals earlier rows — the same direction a touch
        // scroll moves content — so the sign flips going from pixels to rows.
        const rows = Math.round(-delta / ROW_HEIGHT);
        const next = Math.min(Math.max(drag.startSelected + rows, 0), tracks.length - 1);
        if (next !== selected) onSelect(next);
        requestAnimationFrame(() => {
          wasDragging.current = false;
        });
      }
      dragRef.current = null;
      setDragDeltaPx(0);
      setIsDragging(false);
    },
    [clampDelta, selected, tracks.length, onSelect],
  );

  // Where the list would have to sit for the selected row to land dead
  // centre — the pure "cursor never moves" version.
  const centeredOffset = stripHeight / 2 - ROW_HEIGHT / 2 - selected * ROW_HEIGHT;

  // Clamped so the rail can never reveal empty space past either end of the
  // actual list: `0` keeps row zero's top from being pushed below the
  // strip's own top, and `stripHeight - railHeight` keeps the last row's
  // bottom from being pulled above the strip's own bottom. Near either edge
  // this wins over centring — track zero sits flush at the top rather than
  // floating in the middle of a mostly-empty strip.
  const railRows = tracks.length + (isLoadingMore ? 1 : 0);
  const railHeight = railRows * ROW_HEIGHT;
  const minOffset = Math.min(0, stripHeight - railHeight);
  const restingOffset = Math.min(0, Math.max(minOffset, centeredOffset));

  // The cursor band follows the resting position, not the drag delta — it
  // holds still through a drag (the list moves under it) and only steps
  // away from dead centre between selections, at the ends of the list.
  const cursorCenter = restingOffset + selected * ROW_HEIGHT + ROW_HEIGHT / 2;

  // A drag in progress pulls the rail away from its resting position.
  const offset = restingOffset + dragDeltaPx;

  return (
    <div className="arcade-select">
      {/* ── The chosen one, written large ─────────────────────────────── */}
      <div className="arcade-detail order-2 min-w-0 lg:order-1">
        {current ? (
          <>
            {/* A faint, blurred echo of the cover art filling the panel behind
                the content — the panel's own height comes from the strip
                beside it, not from this text, so without something to fill
                the rest it would just be a lot of dead air under the button. */}
            <CoverArt
              key={`glow-${current.id}`}
              kind="tracks"
              id={current.id}
              size="full"
              className="arcade-detail-glow"
              alt=""
              bare
            />
            <div key={current.id} className="arcade-detail-inner">
              <div className="arcade-detail-head">
                <CoverArt
                  kind="tracks"
                  id={current.id}
                  className="arcade-detail-art rounded-xl border border-blue-700"
                />
                <div className="flex min-w-0 flex-col justify-center">
                  <h2 className="text-2xl font-semibold leading-tight text-white lg:text-3xl">
                    {current.title}
                  </h2>
                  <p className="mt-1 text-base text-blue-200">{current.artist ?? 'Unknown artist'}</p>
                  <p className="text-sm text-blue-400">{current.album ?? 'No album'}</p>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => play(selected)}
                      disabled={current.missing}
                      className="btn-primary btn-md min-h-12 gap-2 px-6 text-base font-semibold uppercase tracking-[0.12em]"
                    >
                      <PlayIcon className="h-3.5 w-3.5" />
                      Play
                    </button>
                    <FavoriteButton trackId={current.id} isFavorited={favoriteIds.has(current.id)} />
                  </div>
                </div>
              </div>

              <dl className="arcade-stat-row">
                <Fact label="Length" value={formatDuration(current.duration)} />
                <Fact label="Format" value={current.format ?? '—'} />
                <Fact label="Plays" value={current.playCount > 0 ? String(current.playCount) : '—'} />
                <Fact
                  label="Status"
                  value={current.missing ? 'File missing' : current.hidden ? 'Hidden' : 'Ready'}
                  accent={current.missing}
                />
                <Fact label="Added" value={formatDate(current.dateAdded)} />
              </dl>

              {moreFromArtist.length > 0 && (
                <div className="arcade-detail-more">
                  <h3 className="arcade-detail-more-heading">More from {current.artist}</h3>
                  <ul className="arcade-detail-more-list">
                    {moreFromArtist.map((track) => (
                      <li key={track.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const index = tracks.findIndex((t) => t.id === track.id);
                            if (index !== -1) onSelect(index);
                          }}
                          className="arcade-detail-more-item"
                        >
                          <span className="truncate">{track.title}</span>
                          <span className="arcade-detail-more-item-meta">
                            {formatDuration(track.duration)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-blue-300">Nothing here yet.</p>
        )}
      </div>

      {/* ── The strip ─────────────────────────────────────────────────── */}
      <div className="arcade-rail-col order-1 lg:order-2">
        <div className="arcade-strip">
          <div
            ref={stripRef}
            className="arcade-strip-viewport"
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            tabIndex={0}
            role="listbox"
            aria-label="Tracks"
            aria-activedescendant={current ? rowId(current.id) : undefined}
          >
            {/* The cursor. A fixed band the list travels under, rather than a
                highlight that moves — which is the whole point of the layout, and
                the reason it is a sibling of the list instead of a class on a
                row. Its own position, not a flat 50%, so it can step off dead
                centre at either end of the list instead of leaving empty strip
                above track one or below the last track. */}
            <div
              aria-hidden
              className="arcade-cursor"
              style={{ height: ROW_HEIGHT, top: cursorCenter }}
            >
              {launchToken !== null && <span key={launchToken} className="arcade-launch-flash" />}
            </div>

            <div
              className={`arcade-rail ${isDragging ? 'is-dragging' : ''}`}
              style={{ transform: `translateY(${offset}px)` }}
            >
              {tracks.map((track, i) => (
                <div
                  key={track.id}
                  id={rowId(track.id)}
                  role="option"
                  aria-selected={i === selected}
                  // A click selects; a click on what is already selected plays.
                  // Two gestures on one control, distinguished by where the
                  // cursor already is, which is how the reference's single button
                  // does confirm. Not individually focusable — the listbox holds
                  // focus and reports position via aria-activedescendant, so a
                  // screen reader user doesn't have to tab through every row.
                  onClick={() => {
                    if (wasDragging.current) return;
                    if (i === selected) play(i);
                    else onSelect(i);
                  }}
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
                </div>
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

          {/* The strip's own status line, inside the same bordered panel
              rather than floating below it — one theme instead of two. */}
          <p className="arcade-strip-footer">
            {tracks.length > 0 ? `${selected + 1} of ${tracks.length} loaded` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`arcade-stat ${accent ? 'is-accent' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
