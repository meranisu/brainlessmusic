import { useCallback, useMemo, useRef, type PointerEvent } from 'react';
import type { TrackSummary } from '../types/api';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

/** Which rail letter a title falls under — anything that isn't A-Z buckets
 *  under `#`, the same way a phone's contacts list groups digits and
 *  symbols together rather than giving each its own row. */
export function bucketOf(title: string): string {
  const ch = title.trim().charAt(0).toUpperCase();
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

/** `#` first, then A..Z — the same order the list itself sorts in (SQLite's
 *  `COLLATE NOCASE` puts symbols and digits ahead of letters). */
function rankOf(letter: string): number {
  return letter === '#' ? 0 : letter.charCodeAt(0) - 64;
}

interface AlphabetIndexProps {
  tracks: TrackSummary[];
  currentBucket: string | null;
  onJump: (index: number) => void;
}

/**
 * An iOS-contacts-style letter rail down the strip's own edge — tap or drag
 * to land on a title, instead of dialling through hundreds of rows one
 * notch at a time. Only meaningful because the strip is already sorted by
 * title (`LibraryPage`'s own query: `sort=title&order=asc`) — jumping to
 * "M" means something specific because of that, not because of anything
 * this component checks itself.
 *
 * One pointer-tracking surface rather than 27 individually-hit-tested
 * buttons — the container captures the pointer on press and reads whichever
 * letter it's currently over on every move, which is what lets a single
 * drag sweep from "A" to "Z" the way it does on a phone.
 */
export function AlphabetIndex({ tracks, currentBucket, onJump }: AlphabetIndexProps) {
  const railRef = useRef<HTMLDivElement>(null);

  // Letters an already-loaded track actually starts with — everything else
  // still jumps (to the nearest letter after it that does exist), just
  // dimmed so a sparse stretch of the alphabet doesn't look like every
  // letter is a live destination.
  const present = useMemo(() => {
    const set = new Set<string>();
    for (const track of tracks) set.add(bucketOf(track.title));
    return set;
  }, [tracks]);

  const jumpToLetter = useCallback(
    (letter: string) => {
      if (tracks.length === 0) return;
      const targetRank = rankOf(letter);
      for (let i = 0; i < tracks.length; i++) {
        if (rankOf(bucketOf(tracks[i].title)) >= targetRank) {
          onJump(i);
          return;
        }
      }
      // Nothing loaded reaches that far yet — land on the last loaded row,
      // which is also exactly what the strip's own near-end prefetch
      // watches for, so more of the list arrives right behind it.
      onJump(tracks.length - 1);
    },
    [tracks, onJump],
  );

  const letterAt = useCallback((clientY: number): string | null => {
    const rail = railRef.current;
    if (!rail) return null;
    const rect = rail.getBoundingClientRect();
    if (rect.height === 0) return null;
    const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 0.999);
    return LETTERS[Math.floor(ratio * LETTERS.length)] ?? null;
  }, []);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // Never the strip's own drag-the-rail gesture underneath this.
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const letter = letterAt(event.clientY);
      if (letter) jumpToLetter(letter);
    },
    [letterAt, jumpToLetter],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.buttons === 0) return;
      event.stopPropagation();
      const letter = letterAt(event.clientY);
      if (letter) jumpToLetter(letter);
    },
    [letterAt, jumpToLetter],
  );

  return (
    <div
      ref={railRef}
      className="arcade-alpha-index"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => event.stopPropagation()}
      role="toolbar"
      aria-label="Jump to letter"
    >
      {LETTERS.map((letter) => (
        <span
          key={letter}
          className={`arcade-alpha-index-letter ${present.has(letter) ? '' : 'is-sparse'} ${
            currentBucket === letter ? 'is-current' : ''
          }`}
          aria-hidden
        >
          {letter}
        </span>
      ))}
    </div>
  );
}
