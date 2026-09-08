import { useEffect, useRef, useState } from 'react';
import type { TrackSummary } from '../types/api';

interface TrackRowMenuProps {
  track: TrackSummary;
  isAdmin: boolean;
  onEdit: () => void;
  onDiagnostics: () => void;
  onAddToPlaylist: () => void;
  onToggleHidden: () => void;
  onToggleNotRecommended: () => void;
  onDelete: () => void;
}

export function TrackRowMenu({
  track,
  isAdmin,
  onEdit,
  onDiagnostics,
  onAddToPlaylist,
  onToggleHidden,
  onToggleNotRecommended,
  onDelete,
}: TrackRowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function runAndClose(fn: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen(false);
      fn();
    };
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-md px-2 py-1 text-blue-300 hover:bg-blue-700 hover:text-blue-100"
        aria-label={`Actions for ${track.title}`}
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-blue-700 bg-blue-800 py-1 text-sm">
          <MenuItem onClick={runAndClose(onAddToPlaylist)}>Add to playlist</MenuItem>
          <MenuItem onClick={runAndClose(onEdit)}>Edit tags</MenuItem>
          <MenuItem onClick={runAndClose(onDiagnostics)}>Diagnostics</MenuItem>
          {isAdmin && (
            <>
              <div className="my-1 border-t border-blue-700" />
              <MenuItem onClick={runAndClose(onToggleHidden)}>{track.hidden ? 'Unhide' : 'Hide'}</MenuItem>
              <MenuItem onClick={runAndClose(onToggleNotRecommended)}>
                {track.notRecommended ? 'Mark recommended' : 'Mark not recommended'}
              </MenuItem>
              <div className="my-1 border-t border-blue-700" />
              <MenuItem onClick={runAndClose(onDelete)} className="text-red-400">
                Delete
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  children,
  className,
}: {
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-blue-100 hover:bg-blue-700 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
