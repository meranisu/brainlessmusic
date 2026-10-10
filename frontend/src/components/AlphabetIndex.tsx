import { useCallback, useMemo, useRef, type PointerEvent } from 'react';
import type { TrackSummary } from '../types/api';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

/** The rail letter for a title; anything outside A-Z goes under `#`. */
export function bucketOf(title: string): string {
  const ch = title.trim().charAt(0).toUpperCase();
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

/** `#` first, then A..Z, matching `COLLATE NOCASE` order. */
function rankOf(letter: string): number {
  return letter === '#' ? 0 : letter.charCodeAt(0) - 64;
}

interface AlphabetIndexProps {
  tracks: TrackSummary[];
  currentBucket: string | null;
  onJump: (index: number) => void;
}

/**
 * A letter rail on the strip's edge; tap or drag to jump. Relies on the strip being sorted by title. One surface
 * captures the pointer and reads the letter under it, so a single drag can sweep A to Z.
 */
export function AlphabetIndex({ tracks, currentBucket, onJump }: AlphabetIndexProps) {
  const railRef = useRef<HTMLDivElement>(null);

  // Letters some loaded track starts with. The rest are dimmed but still jump to the next one that exists.
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
      // Not loaded that far: land on the last row, which also triggers the near-end prefetch.
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
