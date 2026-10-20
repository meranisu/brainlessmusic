import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { usePresence } from '../hooks/usePresence';
import { useAuth } from '../auth/AuthContext';
import { fetchOnThisDay } from '../lib/onThisDay';
import { CoverArt } from './CoverArt';
import { usePlayer } from './PlayerBar';

/**
 * On this day: a toolbar button next to Mixes, listing each earlier year the user played something on today's date.
 * A pick plays that day's songs, most played first. Hidden when there is nothing to show.
 */
export function OnThisDay() {
  const { playQueue, inRoom } = usePlayer();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const menu = usePresence(open || null, 120);
  const ref = useRef<HTMLDivElement>(null);
  // The date is part of the key, so the list turns over at local midnight on the next visit.
  const today = new Date().toDateString();
  const result = useQuery({
    queryKey: ['on-this-day', user?.id, today],
    queryFn: fetchOnThisDay,
    staleTime: 30 * 60 * 1000,
    enabled: user != null && !user.isGuest,
  });

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const years = (result.data?.years ?? [])
    .map((year) => ({ ...year, tracks: year.tracks.filter((track) => !track.missing) }))
    .filter((year) => year.tracks.length > 0);
  if (years.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="library-view-option">
        On this day
      </button>
      {menu.item && (
        <div
          data-state={menu.state}
          className="motion-menu absolute left-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-blue-700 bg-blue-800 py-1"
        >
          <p className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">
            What you played today, years back
          </p>
          {years.map((year) => {
            const first = year.tracks[0];
            return (
              <button
                key={year.year}
                type="button"
                disabled={inRoom}
                onClick={() => {
                  setOpen(false);
                  playQueue(year.tracks, 0);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-blue-700 disabled:opacity-40"
              >
                <CoverArt kind="tracks" id={first.id} className="h-10 w-10" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">
                    {year.yearsAgo === 1 ? '1 year ago' : `${year.yearsAgo} years ago`}
                    <span className="font-normal text-blue-300"> · {year.year}</span>
                  </span>
                  <span className="block truncate text-xs text-blue-300">
                    {year.tracks.length === 1 ? first.title : `${first.title} and ${year.tracks.length - 1} more`}
                  </span>
                </span>
              </button>
            );
          })}
          {inRoom && <p className="px-3 py-2 text-xs text-blue-300">Off in a room.</p>}
        </div>
      )}
    </div>
  );
}
