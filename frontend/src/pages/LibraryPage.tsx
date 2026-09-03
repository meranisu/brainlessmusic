import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { usePreviewPlayer } from '../components/PreviewPlayerBar';
import { apiClient } from '../lib/apiClient';
import type { SortField, SortOrder, TrackListParams, TrackListResponse, VisibilityFilter } from '../types/api';

const PAGE_SIZE = 50;

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildQuery(params: TrackListParams): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);
  if (params.order) qs.set('order', params.order);
  if (params.hidden) qs.set('hidden', params.hidden);
  if (params.notRecommended) qs.set('notRecommended', params.notRecommended);
  qs.set('limit', String(params.limit ?? PAGE_SIZE));
  qs.set('offset', String(params.offset ?? 0));
  return qs.toString();
}

export function LibraryPage() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortField>('title');
  const [order, setOrder] = useState<SortOrder>('asc');
  const [hidden, setHidden] = useState<VisibilityFilter>('exclude');
  const [notRecommended, setNotRecommended] = useState<VisibilityFilter>('all');
  const [page, setPage] = useState(0);
  const { play } = usePreviewPlayer();

  const params: TrackListParams = { search, sort, order, hidden, notRecommended, offset: page * PAGE_SIZE };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tracks', params],
    queryFn: () => apiClient.get<TrackListResponse>(`/tracks?${buildQuery(params)}`),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-neutral-100">Library</h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search title, artist, album…"
          className="w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortField)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        >
          <option value="title">Title</option>
          <option value="artist">Artist</option>
          <option value="album">Album</option>
          <option value="duration">Duration</option>
          <option value="dateAdded">Date added</option>
          <option value="playCount">Play count</option>
        </select>
        <button
          onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-300"
          aria-label="Toggle sort order"
        >
          {order === 'asc' ? '↑' : '↓'}
        </button>
        <select
          value={hidden}
          onChange={(e) => setHidden(e.target.value as VisibilityFilter)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        >
          <option value="exclude">Visible only</option>
          <option value="all">All (incl. hidden)</option>
          <option value="only">Hidden only</option>
        </select>
        <select
          value={notRecommended}
          onChange={(e) => setNotRecommended(e.target.value as VisibilityFilter)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
        >
          <option value="all">All (recommended + not)</option>
          <option value="exclude">Recommended only</option>
          <option value="only">Not-recommended only</option>
        </select>
      </div>

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {isError && <p className="text-sm text-red-400">Failed to load tracks.</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-800 text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium"></th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Artist</th>
                  <th className="px-3 py-2 font-medium">Album</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Format</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {data.tracks.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-900 hover:bg-neutral-900/50">
                    <td className="px-3 py-2">
                      <button
                        onClick={() => play(t.id, `${t.title} — ${t.artist ?? 'Unknown Artist'}`)}
                        className="text-neutral-400 hover:text-neutral-100"
                        aria-label={`Preview ${t.title}`}
                      >
                        ▶
                      </button>
                    </td>
                    <td className="px-3 py-2 text-neutral-100">{t.title}</td>
                    <td className="px-3 py-2 text-neutral-400">{t.artist ?? '—'}</td>
                    <td className="px-3 py-2 text-neutral-400">{t.album ?? '—'}</td>
                    <td className="px-3 py-2 text-neutral-400">{formatDuration(t.duration)}</td>
                    <td className="px-3 py-2 text-neutral-400">{t.format ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {t.hidden && (
                          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                            hidden
                          </span>
                        )}
                        {t.notRecommended && (
                          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                            not recommended
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.tracks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                      No tracks match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-3 text-sm text-neutral-500">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-neutral-700 px-2 py-1 disabled:opacity-30"
            >
              Prev
            </button>
            <span>
              Page {page + 1} of {totalPages} · {data.total} tracks
            </span>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-neutral-700 px-2 py-1 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
