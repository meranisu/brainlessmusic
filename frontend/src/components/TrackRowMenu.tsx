import { useEffect, useRef, useState } from 'react';
import type { TrackSummary } from '../types/api';

interface TrackRowMenuProps {
  track: TrackSummary;
  isAdmin: boolean;
  onEdit: () => void;
  onDiagnostics: () => void;
  onToggleHidden: () => void;
  onToggleNotRecommended: () => void;
  onDelete: () => void;
}

export function TrackRowMenu({
  track,
  isAdmin,
  onEdit,
  onDiagnostics,
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
        className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        aria-label={`Actions for ${track.title}`}
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-neutral-700 bg-neutral-800 py-1 text-sm shadow-lg">
          <MenuItem onClick={runAndClose(onEdit)}>Edit tags</MenuItem>
          <MenuItem onClick={runAndClose(onDiagnostics)}>Diagnostics</MenuItem>
          {isAdmin && (
            <>
              <div className="my-1 border-t border-neutral-700" />
              <MenuItem onClick={runAndClose(onToggleHidden)}>{track.hidden ? 'Unhide' : 'Hide'}</MenuItem>
              <MenuItem onClick={runAndClose(onToggleNotRecommended)}>
                {track.notRecommended ? 'Mark recommended' : 'Mark not recommended'}
              </MenuItem>
              <div className="my-1 border-t border-neutral-700" />
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
      className={`block w-full px-3 py-1.5 text-left text-neutral-200 hover:bg-neutral-700 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
