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
import { AlphabetIndex } from './AlphabetIndex';
import { CoverArt } from './CoverArt';
import { FavoriteButton } from './FavoriteButton';
import { PlayIcon } from './icons';
import { formatDate, formatDuration } from '../lib/format';
import { letterEntry } from '../lib/letterIndex';
import type { LetterEntry, TrackSummary } from '../types/api';

/** One entry's height. Fixed, because the strip's geometry is arithmetic on it; measuring would drift the cursor. */
export const ROW_HEIGHT = 68;

/** Movement before a press becomes a drag; an unsteady tap still selects. */
const DRAG_THRESHOLD_PX = 6;

/** Rows drawn past each edge of what is on screen, so a flick doesn't show a gap before the next render. */
const OVERSCAN_ROWS = 6;

/** A jump this many rows or more snaps instead of sliding: sliding past thousands of rows draws nothing but blank. */
const SNAP_ROWS = 8;

/** Below this many tracks the letter rail isn't shown. */
const ALPHABET_INDEX_MIN_TRACKS = 8;

/** How long typed letters count as one search before resetting. */
const TYPEAHEAD_RESET_MS = 700;

const rowId = (trackId: number) => `arcade-row-${trackId}`;

interface ArcadeSelectProps {
  /** How many songs the whole list holds, loaded or not. The strip is that long; only the rows near it are drawn. */
  total: number;
  /** The song at an index, or undefined while its page is on its way (a placeholder row shows meanwhile). */
  getTrack: (index: number) => TrackSummary | undefined;
  /** The songs loaded now with their indexes, in order, for "More from artist" and letter typing. */
  loaded: { index: number; track: TrackSummary }[];
  /** Where each letter starts in the whole list (`useLetterIndex`); the rail waits for it. */
  letters?: LetterEntry[];
  /** Favourited ids, fetched once by the page rather than per row. */
  favoriteIds: Set<number>;
  selected: number;
  onSelect: (index: number) => void;
  onPlay: (index: number) => void;
  /** A formatted scan status (`"Scanning… 43/210"`), worded by the page. Empty shows nothing. */
  scanStatus?: string;
}

/**
 * The music select: names on the right, the chosen one large on the left. The cursor doesn't move; the list does.
 * A cursor walking down a static list is a file browser; a list travelling under a fixed cursor is a machine offering you things.
 */
export function ArcadeSelect({
  total,
  getTrack,
  loaded,
  letters,
  favoriteIds,
  selected,
  onSelect,
  onPlay,
  scanStatus,
}: ArcadeSelectProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripHeight, setStripHeight] = useState(0);

  // Observed, not read once, so a rotated phone re-centres the cursor.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStripHeight(entry.contentRect.height));
    observer.observe(el);
    setStripHeight(el.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, []);

  const current = getTrack(selected);

  // Other tracks by the artist from what is loaded, for the detail panel; nothing is fetched.
  const moreFromArtist = useMemo(() => {
    if (!current?.artist) return [];
    return loaded.filter(({ track }) => track.artist === current.artist && track.id !== current.id).slice(0, 5);
  }, [loaded, current]);

  // Whether the last change of selection was a jump (see SNAP_ROWS). Worked out as the selection changes, from the one
  // before it, so no ref is read while rendering.
  const [lastSelected, setLastSelected] = useState(selected);
  const [snaps, setSnaps] = useState(false);
  if (lastSelected !== selected) {
    setLastSelected(selected);
    setSnaps(Math.abs(selected - lastSelected) >= SNAP_ROWS);
  }

  // Flash on play, not on select (Q23). A counter, so two plays in a row each remount via `key`; `null` skips mount.
  const [launchToken, setLaunchToken] = useState<number | null>(null);
  const play = useCallback(
    (index: number) => {
      setLaunchToken((t) => (t ?? 0) + 1);
      onPlay(index);
    },
    [onPlay],
  );

  // Buffered so "st" narrows past "s". A ref: it must persist without re-rendering.
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

      // One letter, from outside that letter: straight to where it starts, loaded or not.
      if (buffer.length === 1 && letters && /[a-z]/.test(buffer)) {
        const entry = letterEntry(letters, buffer.toUpperCase());
        if (entry && entry.count > 0 && (selected < entry.offset || selected >= entry.offset + entry.count)) {
          onSelect(entry.offset);
          return;
        }
      }

      // Otherwise the loaded songs: start after the selection and wrap, so repeating a letter cycles through matches.
      if (loaded.length === 0) return;
      const after = loaded.findIndex(({ index }) => index > selected);
      const from = after === -1 ? 0 : after;
      for (let step = 0; step < loaded.length; step++) {
        const entry = loaded[(from + step) % loaded.length];
        if (entry.track.title.toLowerCase().startsWith(buffer)) {
          onSelect(entry.index);
          return;
        }
      }
    },
    [loaded, letters, selected, onSelect],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (total === 0) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          onSelect(Math.min(selected + 1, total - 1));
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
          onSelect(total - 1);
          return;
        case 'Enter':
          event.preventDefault();
          play(selected);
          return;
        default:
          // Single characters only, leaving shortcuts alone. Stopped so the player bar's space/n/p keys don't fire.
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            jumpToLetters(event.key);
          }
      }
    },
    [total, selected, onSelect, play, jumpToLetters],
  );

  /** The wheel moves the selection one row per notch, like a turntable; free scrolling would disagree with the cursor. */
  const onWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      const step = event.deltaY > 0 ? 1 : -1;
      const next = Math.min(Math.max(selected + step, 0), total - 1);
      if (next !== selected) onSelect(next);
    },
    [selected, total, onSelect],
  );

  /**
   * Dragging the rail: it follows the pointer, then snaps to the nearest row on release. State is in a ref, so a drag
   * doesn't call `onSelect` for every pixel; only the release commits.
   */
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startSelected: number;
    dragging: boolean;
  } | null>(null);
  const [dragDeltaPx, setDragDeltaPx] = useState(0);
  // Render-visible copy of `dragRef.current.dragging`; handlers read the ref.
  const [isDragging, setIsDragging] = useState(false);
  // Cleared a frame after release, so the pointerup's synthetic click doesn't select or play again.
  const wasDragging = useRef(false);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || total === 0) return;
      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startSelected: selected,
        dragging: false,
      };
    },
    [selected, total],
  );

  // Keeps a drag inside the list. Dragging up (negative) reveals later rows, so the rows ahead bound the upward drag.
  const clampDelta = useCallback(
    (startSelected: number, delta: number) => {
      const minDelta = -(total - 1 - startSelected) * ROW_HEIGHT;
      const maxDelta = startSelected * ROW_HEIGHT;
      return Math.min(Math.max(delta, minDelta), maxDelta);
    },
    [total],
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
        // From the event, not state: the listener may not be re-bound after the last pointermove render.
        const delta = clampDelta(drag.startSelected, event.clientY - drag.startY);
        // Dragging down reveals earlier rows, so the sign flips.
        const rows = Math.round(-delta / ROW_HEIGHT);
        const next = Math.min(Math.max(drag.startSelected + rows, 0), total - 1);
        if (next !== selected) onSelect(next);
        requestAnimationFrame(() => {
          wasDragging.current = false;
        });
      }
      dragRef.current = null;
      setDragDeltaPx(0);
      setIsDragging(false);
    },
    [clampDelta, selected, total, onSelect],
  );

  // The offset that puts the selected row dead centre.
  const centeredOffset = stripHeight / 2 - ROW_HEIGHT / 2 - selected * ROW_HEIGHT;

  // Clamped so no empty space shows past either end; near the ends this wins over centring.
  const railHeight = total * ROW_HEIGHT;
  const minOffset = Math.min(0, stripHeight - railHeight);
  const restingOffset = Math.min(0, Math.max(minOffset, centeredOffset));

  // The cursor holds still through a drag and steps off centre only at the list's ends.
  const cursorCenter = restingOffset + selected * ROW_HEIGHT + ROW_HEIGHT / 2;

  // A drag in progress pulls the rail away from its resting position.
  const offset = restingOffset + dragDeltaPx;

  // Only the rows on screen, and a few past each edge, are drawn. Row i sits at i * ROW_HEIGHT whatever the window,
  // since the padding above stands in for the rows before it.
  const firstRow = Math.max(0, Math.floor(-offset / ROW_HEIGHT) - OVERSCAN_ROWS);
  const lastRow = Math.min(total - 1, Math.ceil((stripHeight - offset) / ROW_HEIGHT) + OVERSCAN_ROWS);
  const rows: number[] = [];
  for (let i = firstRow; i <= lastRow; i++) rows.push(i);
  const selectedDrawn = selected >= firstRow && selected <= lastRow;

  return (
    <div className="arcade-select">
      {/* The chosen one, written large. */}
      <div className="arcade-detail order-2 min-w-0 lg:order-1">
        {current ? (
          <>
            {/* A faint blurred copy of the cover fills the panel, whose height comes from the strip. */}
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
                    {moreFromArtist.map(({ index, track }) => (
                      <li key={track.id}>
                        <button type="button" onClick={() => onSelect(index)} className="arcade-detail-more-item">
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
          <p className="text-sm text-blue-300">{total === 0 ? 'Nothing here yet.' : 'Loading…'}</p>
        )}
      </div>

      {/* The strip. */}
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
            aria-activedescendant={current && selectedDrawn ? rowId(current.id) : undefined}
          >
            {/* The cursor: a fixed band the list travels under, positioned so it can step off centre at the ends. */}
            <div
              aria-hidden
              className="arcade-cursor"
              style={{ height: ROW_HEIGHT, top: cursorCenter }}
            >
              {launchToken !== null && <span key={launchToken} className="arcade-launch-flash" />}
            </div>

            {total >= ALPHABET_INDEX_MIN_TRACKS && letters && (
              <AlphabetIndex
                letters={letters}
                selected={selected}
                // An empty letter at the very end starts one past the last row.
                onJump={(index) => onSelect(Math.min(Math.max(index, 0), total - 1))}
              />
            )}

            <div
              className={`arcade-rail ${isDragging ? 'is-dragging' : ''} ${
                total >= ALPHABET_INDEX_MIN_TRACKS && letters ? 'has-alpha-index' : ''
              }`}
              style={{
                transform: `translateY(${offset}px)`,
                paddingTop: firstRow * ROW_HEIGHT,
                ...(snaps ? { transition: 'none' } : {}),
              }}
            >
              {rows.map((i) => {
                const track = getTrack(i);
                // Its page hasn't arrived: a quiet row of the same height, so the strip keeps its length and place.
                if (!track) {
                  return (
                    <div
                      key={`pending-${i}`}
                      aria-hidden
                      onClick={() => {
                        if (!wasDragging.current) onSelect(i);
                      }}
                      style={{ height: ROW_HEIGHT }}
                      className={`arcade-row ${i === selected ? 'is-selected' : ''}`}
                    >
                      <span className="skeleton h-3.5 w-2/3 rounded" />
                      <span className="skeleton h-3 w-1/3 rounded" />
                    </div>
                  );
                }
                return (
                  <div
                    key={track.id}
                    id={rowId(track.id)}
                    role="option"
                    aria-selected={i === selected}
                    // Click selects; click on the selection plays. Rows aren't focusable: the listbox uses aria-activedescendant.
                    onClick={() => {
                      if (wasDragging.current) return;
                      if (i === selected) play(i);
                      else onSelect(i);
                    }}
                    style={{ height: ROW_HEIGHT }}
                    className={`arcade-row ${i === selected ? 'is-selected' : ''} ${
                      track.missing ? 'is-missing' : ''
                    } ${track.hasStreamError ? 'has-stream-error' : ''}`}
                    title={
                      track.hasStreamError && !track.missing
                        ? 'Failed to play last time. It might work now.'
                        : undefined
                    }
                  >
                    <span className="arcade-row-title">{track.title}</span>
                    <span className="arcade-row-meta">
                      <span className="truncate">{track.artist ?? 'Unknown artist'}</span>
                      {track.format && <span className="arcade-row-format">{track.format}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* The strip's one status line, inside its panel, with any scan beside the count. */}
          <p className="arcade-strip-footer">
            {scanStatus && <span className="arcade-strip-footer-scan">{scanStatus}</span>}
            <span className="arcade-strip-footer-count">
              {total > 0 ? `${selected + 1} of ${total}` : ''}
            </span>
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
