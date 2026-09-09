/**
 * Transport icons as inline SVG.
 *
 * These were text glyphs (⏮ ▶ ❚❚ ⏭). U+23EE / U+23ED carry emoji presentation
 * by default, so the system emoji font painted them as blue rounded tiles —
 * the buttons looked like coloured squares sitting on the bar, ignored
 * `text-*` colour, and sized themselves off the font rather than the button.
 *
 * Drawn at 24 and sized by the caller, filled with `currentColor` so hover and
 * disabled states come from the button as they do everywhere else.
 */

interface IconProps {
  className?: string;
}

export function PlayIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {/* Nudged right of centre: a triangle centred on its bounding box reads
          as left-heavy, because its visual mass sits at the blunt edge. */}
      <path d="M8.5 5.2v13.6a.9.9 0 0 0 1.38.76l10.2-6.8a.9.9 0 0 0 0-1.52L9.88 4.44a.9.9 0 0 0-1.38.76Z" />
    </svg>
  );
}

export function PauseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="4.5" width="4" height="15" rx="1.1" />
      <rect x="13.5" y="4.5" width="4" height="15" rx="1.1" />
    </svg>
  );
}

export function SkipBackIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M19.5 6.1v11.8a.9.9 0 0 1-1.38.76l-8.85-5.9a.9.9 0 0 1 0-1.52l8.85-5.9a.9.9 0 0 1 1.38.76Z" />
      <rect x="4.5" y="5.2" width="3" height="13.6" rx="1.1" />
    </svg>
  );
}

export function SkipForwardIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M4.5 6.1v11.8a.9.9 0 0 0 1.38.76l8.85-5.9a.9.9 0 0 0 0-1.52L5.88 5.34a.9.9 0 0 0-1.38.76Z" />
      <rect x="16.5" y="5.2" width="3" height="13.6" rx="1.1" />
    </svg>
  );
}

export function ChevronDownIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ShuffleIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}

export function RepeatIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

/** Repeat, with the "1" the mode actually means rather than a separate glyph. */
export function RepeatOneIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
      <path d="M11 10h1v5" />
    </svg>
  );
}

export function CloseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
