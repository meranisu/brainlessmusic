import { useCallback, useMemo, useRef, type PointerEvent } from 'react';
import { RAIL_LETTERS, letterAtIndex } from '../lib/letterIndex';
import type { LetterEntry } from '../types/api';

interface AlphabetIndexProps {
  /** Where each letter starts in the whole list, from the server: a jump needs no song to be loaded. */
  letters: LetterEntry[];
  /** The selected row, to light the letter that holds it. */
  selected: number;
  onJump: (index: number) => void;
}

/**
 * A letter rail on the strip's edge; tap or drag to jump. Each letter jumps to its first row in the whole list, loaded
 * or not. A letter with no songs is dimmed and jumps to where it would start: the next song that exists. One surface
 * captures the pointer and reads the letter under it, so a single drag can sweep A to Z.
 */
export function AlphabetIndex({ letters, selected, onJump }: AlphabetIndexProps) {
  const railRef = useRef<HTMLDivElement>(null);

  const byLetter = useMemo(() => new Map(letters.map((entry) => [entry.letter, entry])), [letters]);
  const currentBucket = letterAtIndex(letters, selected);

  const jumpToLetter = useCallback(
    (letter: string) => {
      const entry = byLetter.get(letter);
      if (entry) onJump(entry.offset);
    },
    [byLetter, onJump],
  );

  const letterAt = useCallback((clientY: number): string | null => {
    const rail = railRef.current;
    if (!rail) return null;
    const rect = rail.getBoundingClientRect();
    if (rect.height === 0) return null;
    const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 0.999);
    return RAIL_LETTERS[Math.floor(ratio * RAIL_LETTERS.length)] ?? null;
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
      {RAIL_LETTERS.map((letter) => (
        <span
          key={letter}
          className={`arcade-alpha-index-letter ${(byLetter.get(letter)?.count ?? 0) > 0 ? '' : 'is-sparse'} ${
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
