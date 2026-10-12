import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../lib/apiClient';
import type { GenreListResponse } from '../types/api';
import { Skeleton, SkeletonListRows } from '../components/Skeleton';

/**
 * Every genre from the files' genre tags (v0.4 box 27). Biggest first, since a few hundred names A-Z bury the ones
 * people actually listen to; the filter finds the rest.
 */
export function GenresPage() {
  const [filter, setFilter] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['genres'],
    queryFn: () => apiClient.get<GenreListResponse>('/genres'),
  });

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (data?.genres ?? [])
      .filter((g) => !needle || g.name.toLowerCase().includes(needle))
      .sort((a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name));
  }, [data, filter]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Genres</h1>
        <p className="text-sm text-blue-300">
          {data ? `${data.genres.length} genre${data.genres.length === 1 ? '' : 's'}` : ' '}
        </p>
      </div>

      {isLoading && (
        <Skeleton label="Loading genres…">
          <SkeletonListRows />
        </Skeleton>
      )}
      {isError && <p className="text-sm text-red-300">Could not load genres.</p>}

      {data && data.genres.length === 0 && (
        <p className="text-sm text-blue-300">
          No genres yet. They come from your files' genre tags and show up after the next library scan.
        </p>
      )}

      {data && data.genres.length > 0 && (
        <>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter genres"
            aria-label="Filter genres"
            className="input max-w-sm"
          />
          {shown.length === 0 ? (
            <p className="text-sm text-blue-300">No genre matches “{filter.trim()}”.</p>
          ) : (
            <ul className="card divide-y divide-blue-800/60 overflow-hidden">
              {shown.map((genre) => (
                <li key={genre.id}>
                  <Link
                    to={`/genres/${genre.id}`}
                    className="flex items-baseline gap-3 px-4 py-3 transition-colors hover:bg-blue-800/40"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-white">{genre.name}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">
                      {genre.albumCount} album{genre.albumCount === 1 ? '' : 's'} · {genre.trackCount} track
                      {genre.trackCount === 1 ? '' : 's'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
