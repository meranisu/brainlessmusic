import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CoverArt } from '../components/CoverArt';
import { FavoriteButton, useFavoriteIds } from '../components/FavoriteButton';
import { usePlayer, type QueueTrack } from '../components/PlayerBar';
import { apiClient } from '../lib/apiClient';
import type { FavoriteListResponse } from '../types/api';
import { PlayIcon } from '../components/icons';

const PAGE_SIZE = 50;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function FavoritesPage() {
  const [page, setPage] = useState(0);
  const { playQueue } = usePlayer();
  const favoriteIds = useFavoriteIds();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['favorites', 'list', page],
    queryFn: () =>
      apiClient.get<FavoriteListResponse>(
        `/me/favorites?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      ),
    placeholderData: (prev) => prev,
  });

  const queue: QueueTrack[] =
    data?.favorites.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.duration,
      format: t.format,
    })) ?? [];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Favorites</h1>
          <p className="text-sm text-blue-300">
            {data ? `${data.total} track${data.total === 1 ? '' : 's'}` : 'Loading…'}
          </p>
        </div>
        {queue.length > 0 && (
          <button onClick={() => playQueue(queue, 0)} className="btn-primary btn-md">
            <PlayIcon className="h-3.5 w-3.5" /> Play all
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-blue-300">Loading favorites…</p>}
      {isError && <p className="text-sm text-red-400">Could not load favorites.</p>}

      {data && data.favorites.length === 0 && (
        <p className="text-sm text-blue-300">
          Nothing favorited yet — tap the heart on any track to add it here.
        </p>
      )}

      {data && data.favorites.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-blue-800 text-left font-mono text-xs uppercase tracking-wider text-blue-400">
              <tr>
                <th className="w-10 py-2.5 pl-4"></th>
                <th className="py-2.5 pr-3">Title</th>
                <th className="py-2.5 pr-3">Artist</th>
                <th className="py-2.5 pr-3">Album</th>
                <th className="py-2.5 pr-4 text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-800/60">
              {data.favorites.map((track, i) => (
                <tr
                  key={track.id}
                  onClick={() => playQueue(queue, i)}
                  className="cursor-pointer transition-colors hover:bg-blue-800/40"
                >
                  <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                    <FavoriteButton trackId={track.id} isFavorited={favoriteIds.has(track.id)} />
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-white">
                    <div className="flex items-center gap-2.5">
                      <CoverArt kind="tracks" id={track.id} className="h-9 w-9" />
                      <span className="truncate">{track.title}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-blue-200">{track.artist ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-blue-200">{track.album ?? '—'}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-blue-200">
                    {formatDuration(track.duration)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm text-blue-200">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn-secondary btn-sm">
            Prev
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary btn-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
