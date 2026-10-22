import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon, PlayIcon } from './icons';

/**
 * One row of Home (A276): a heading and cards that scroll sideways, snapping to a card. Swipe on a phone; from `md`,
 * two arrow buttons scroll it most of a screen at a time, each disabled at its end. "See all" only where a whole page exists.
 */
export function Shelf({
  title,
  detail,
  seeAll,
  children,
}: {
  title: string;
  /** A line under the heading, saying where the row comes from. */
  detail?: string;
  seeAll?: { to: string; label?: string };
  children: ReactNode;
}) {
  const headingId = useId();
  const row = useRef<HTMLUListElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      // A pixel of slack: fractional widths leave `scrollLeft` a hair short of the end.
      setEnds({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
    }
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      resize.disconnect();
    };
  }, []);

  function page(direction: 1 | -1) {
    const el = row.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  }


  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold text-white">
            {title}
          </h2>
          {detail && <p className="truncate text-xs text-blue-300">{detail}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {seeAll && (
            <Link to={seeAll.to} className="text-sm text-blue-200 underline-offset-4 hover:text-white hover:underline">
              {seeAll.label ?? 'See all'}
            </Link>
          )}
          <div className="hidden items-center gap-1 md:flex">
            <button
              type="button"
              onClick={() => page(-1)}
              disabled={ends.start}
              aria-label={`Scroll ${title} back`}
              className="shelf-arrow"
            >
              <ChevronRightIcon className="h-4 w-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => page(1)}
              disabled={ends.end}
              aria-label={`Scroll ${title} on`}
              className="shelf-arrow"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <ul ref={row} className="shelf-row">
        {children}
      </ul>
    </section>
  );
}

/**
 * A card on a shelf: a square picture, a name and a line under it. A link when it opens a page, a button when it
 * plays straight away; either way stretched over the whole card, so the card has one target. `onPlay` adds a play
 * key on the picture (A281) that plays without opening the page; it sits above the stretched target, since a
 * button inside a link is invalid. `badge` sits on the picture's corner.
 */
export function ShelfCard({
  to,
  onClick,
  disabled,
  onPlay,
  playLabel,
  picture,
  badge,
  title,
  subtitle,
  label,
  index = 0,
}: {
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  onPlay?: () => void;
  /** The play key's accessible name, e.g. "Play Blue Train". */
  playLabel?: string;
  picture: ReactNode;
  badge?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** The accessible name, when the title alone doesn't say what a tap does. */
  label?: string;
  index?: number;
}) {
  const stretched = 'shelf-card-target block truncate text-sm font-medium text-white';

  return (
    <li className="shelf-card motion-rise" style={{ '--i': index } as React.CSSProperties}>
      <div className={`shelf-card-hit ${disabled ? 'is-disabled' : ''}`}>
        <span className="relative block">
          {picture}
          {badge && <span className="absolute bottom-1.5 left-1.5">{badge}</span>}
          {onPlay && (
            <button type="button" onClick={onPlay} disabled={disabled} aria-label={playLabel ?? `Play ${title}`} className="shelf-play">
              <PlayIcon className="h-4 w-4" />
            </button>
          )}
        </span>
        <span className="block min-w-0 pt-2">
          {to ? (
            <Link to={to} aria-label={label} className={stretched}>
              {title}
            </Link>
          ) : (
            <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className={`${stretched} w-full text-left`}>
              {title}
            </button>
          )}
          {subtitle && <span className="block truncate text-xs text-blue-300">{subtitle}</span>}
        </span>
      </div>
    </li>
  );
}
