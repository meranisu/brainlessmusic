import { useEffect, useRef, useState } from 'react';
import { usePresence } from '../hooks/usePresence';
import { usePlayer, type QueueTrack } from './PlayerBar';

/**
 * A song row's ⋮ with Play next and Add to queue (A260), for the album, playlist and search tables. The Library's
 * Full view has these in its bigger `TrackRowMenu`. Hidden for the song that's playing: it can't go after itself.
 */
export function QueueMenu({ track }: { track: QueueTrack }) {
  const { playNext, addToQueue, current } = usePlayer();
  const [open, setOpen] = useState(false);
  const menu = usePresence(open || null, 120);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (current?.id === track.id) return null;

  function run(fn: (t: QueueTrack) => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen(false);
      fn(track);
    };
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Queue options for ${track.title}`}
        className="tap-target rounded-md px-2 py-1 text-blue-300 hover:bg-blue-700 hover:text-blue-100"
      >
        ⋮
      </button>
      {menu.item && (
        <div
          data-state={menu.state}
          className="motion-menu absolute right-0 z-20 mt-1 w-44 rounded-lg border border-blue-700 bg-blue-800 py-1 text-sm"
        >
          <button onClick={run(playNext)} className="block w-full px-3 py-1.5 text-left text-blue-100 hover:bg-blue-700">
            Play next
          </button>
          <button onClick={run(addToQueue)} className="block w-full px-3 py-1.5 text-left text-blue-100 hover:bg-blue-700">
            Add to queue
          </button>
        </div>
      )}
    </div>
  );
}
