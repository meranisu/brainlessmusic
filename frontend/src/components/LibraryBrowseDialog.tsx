import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useScrollLock } from '../hooks/useScrollLock';
import { ApiError, apiClient } from '../lib/apiClient';
import type { BrowseDirResponse } from '../types/api';
import { ArrowUpIcon, FolderIcon } from './icons';

interface LibraryBrowseDialogProps {
  /** Where to start browsing — the path already typed, if any. */
  initialPath?: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

/**
 * Browses the *container's* filesystem, not the client's — a native OS folder
 * picker can't help here: browsers never hand back a picked folder's real
 * path, and the path this app wants is one inside the container anyway,
 * which the admin's own device has no view into regardless.
 *
 * Cancel (or Escape, or the backdrop) leaves the caller's path field exactly
 * as it was; only "Use this folder" writes anything back.
 */
export function LibraryBrowseDialog({ initialPath, onSelect, onCancel }: LibraryBrowseDialogProps) {
  const [currentPath, setCurrentPath] = useState(initialPath?.trim() || '/');

  useScrollLock();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['library-browse', currentPath],
    queryFn: () => apiClient.get<BrowseDirResponse>(`/library/browse?path=${encodeURIComponent(currentPath)}`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="card flex w-full max-w-sm flex-col p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-white">Choose a folder</h2>
        <p className="mt-1 truncate rounded-md border border-blue-800 bg-blue-950/60 px-2.5 py-1.5 font-mono text-xs text-blue-300">
          {currentPath}
        </p>

        <div className="mt-3 max-h-64 min-h-32 overflow-y-auto rounded-md border border-blue-800">
          {isLoading && <p className="p-3 text-sm text-blue-300">Loading…</p>}

          {isError && (
            <p className="p-3 text-sm text-red-300">
              {error instanceof ApiError ? error.message : 'Could not read that folder.'}
            </p>
          )}

          {data && (
            <ul className="divide-y divide-blue-800/60">
              {data.parent !== null && (
                <li>
                  <button
                    onClick={() => setCurrentPath(data.parent!)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-blue-200 transition-colors hover:bg-blue-800/60"
                  >
                    <ArrowUpIcon className="h-4 w-4 shrink-0 text-blue-400" />
                    <span>Up a level</span>
                  </button>
                </li>
              )}

              {data.entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    onClick={() => setCurrentPath(entry.path)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white transition-colors hover:bg-blue-800/60"
                  >
                    <FolderIcon className="h-4 w-4 shrink-0 text-blue-400" />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  </button>
                </li>
              ))}

              {data.entries.length === 0 && data.parent !== null && (
                <li className="px-3 py-2 text-sm text-blue-400">No subfolders here.</li>
              )}
            </ul>
          )}

          {data?.truncated && (
            <p className="border-t border-blue-800/60 px-3 py-2 text-xs text-blue-400">
              Showing the first 500 folders only.
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary btn-sm">
            Cancel
          </button>
          <button onClick={() => onSelect(currentPath)} disabled={!data} className="btn-primary btn-sm">
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
}
