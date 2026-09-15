import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AlbumGrid } from '../components/AlbumGrid';
import { LibraryEmptyState } from '../components/LibraryEmptyState';
import { apiClient } from '../lib/apiClient';
import type { AlbumListResponse } from '../types/api';

const PAGE_SIZE = 50;

export function AlbumsPage() {
  const [page, setPage] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['albums', page],
    queryFn: () =>
      apiClient.get<AlbumListResponse>(`/albums?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Albums</h1>
        <p className="text-sm text-blue-300">
          {data ? `${data.total} album${data.total === 1 ? '' : 's'}` : 'Loading…'}
        </p>
      </div>

      {isLoading && <p className="text-sm text-blue-300">Loading albums…</p>}
      {isError && <p className="text-sm text-red-400">Could not load albums.</p>}

      {data && data.total === 0 && <LibraryEmptyState />}
      {data && data.total > 0 && <AlbumGrid albums={data.albums} />}

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
