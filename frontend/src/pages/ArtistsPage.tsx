import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LibraryEmptyState } from '../components/LibraryEmptyState';
import { apiClient } from '../lib/apiClient';
import type { ArtistListResponse } from '../types/api';

const PAGE_SIZE = 50;

export function ArtistsPage() {
  const [page, setPage] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['artists', page],
    queryFn: () =>
      apiClient.get<ArtistListResponse>(`/artists?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Artists</h1>
        <p className="text-sm text-blue-300">
          {data ? `${data.total} artist${data.total === 1 ? '' : 's'}` : 'Loading…'}
        </p>
      </div>

      {isLoading && <p className="text-sm text-blue-300">Loading artists…</p>}
      {isError && <p className="text-sm text-red-400">Could not load artists.</p>}

      {data && data.artists.length === 0 && <LibraryEmptyState />}

      {data && data.artists.length > 0 && (
        <ul className="card divide-y divide-blue-800/60 overflow-hidden">
          {data.artists.map((artist) => (
            <li key={artist.id}>
              <Link
                to={`/artists/${artist.id}`}
                className="flex items-baseline gap-3 px-4 py-3 transition-colors hover:bg-blue-800/40"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-white">{artist.name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">
                  {artist.albumCount} album{artist.albumCount === 1 ? '' : 's'} ·{' '}
                  {artist.trackCount} track{artist.trackCount === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
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
