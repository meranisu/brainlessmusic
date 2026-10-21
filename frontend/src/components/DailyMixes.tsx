import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePresence } from '../hooks/usePresence';
import { useAuth } from '../auth/AuthContext';
import { fetchDailyMixes } from '../lib/mix';
import { MixCover } from './MixCover';
import { RadioIcon } from './icons';

/**
 * Today's mixes (A234, A236): a toolbar button opening up to six, one per top genre. A pick opens the mix's page, which
 * lists its songs and plays it (owner, 2026-10-21). Hidden until the user has plays to build them from.
 */
export function DailyMixes() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const menu = usePresence(open || null, 120);
  const ref = useRef<HTMLDivElement>(null);
  // Same all day on the server, so a long stale time saves the request on every visit to the library.
  // Guests have no listening history of their own (A37), so they get no mixes.
  const mixes = useQuery({
    queryKey: ['mix', 'daily', user?.id],
    queryFn: fetchDailyMixes,
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

  const list = mixes.data?.mixes ?? [];
  if (list.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="library-view-option flex items-center gap-1.5"
      >
        <RadioIcon className="h-4 w-4" />
        Mixes
      </button>
      {menu.item && (
        <div
          data-state={menu.state}
          className="motion-menu absolute left-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-blue-700 bg-blue-800 py-1"
        >
          <p className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">
            Today, from what you play
          </p>
          {list.map((mix) => {
            return (
              <Link
                key={mix.id}
                to={`/mixes/${mix.id}`}
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-blue-700 focus-visible:bg-blue-700"
              >
                <MixCover tracks={mix.tracks} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{mix.name} mix</span>
                  <span className="block truncate text-xs text-blue-300">
                    {mix.tracks
                      .slice(0, 3)
                      .map((track) => track.artist ?? 'Unknown Artist')
                      .filter((artist, i, all) => all.indexOf(artist) === i)
                      .join(', ')}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
