import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { usePreviewPlayer } from '../components/PreviewPlayerBar';
import { useToast } from '../components/ToastProvider';
import { TrackDetailDrawer } from '../components/TrackDetailDrawer';
import { TrackRowMenu } from '../components/TrackRowMenu';
import { apiClient, ApiError } from '../lib/apiClient';
import type {
  SortField,
  SortOrder,
  TrackListParams,
  TrackListResponse,
  TrackSummary,
  VisibilityFilter,
} from '../types/api';

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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeTrack, setActiveTrack] = useState<{ id: number; tab: 'tags' | 'diagnostics' } | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<TrackSummary[] | null>(null);

  const { play } = usePreviewPlayer();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = Boolean(user?.isAdmin);

  const params: TrackListParams = { search, sort, order, hidden, notRecommended, offset: page * PAGE_SIZE };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tracks', params],
    queryFn: () => apiClient.get<TrackListResponse>(`/tracks?${buildQuery(params)}`),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function invalidateAfterMutation() {
    queryClient.invalidateQueries({ queryKey: ['tracks'] });
  }

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<TrackSummary> }) =>
      apiClient.patch(`/tracks/${id}`, patch),
    onSuccess: invalidateAfterMutation,
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Update failed', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => apiClient.delete(`/tracks/${id}`))),
    onSuccess: (_result, ids) => {
      invalidateAfterMutation();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setDeleteTargets(null);
      showToast(ids.length === 1 ? 'Track deleted' : `${ids.length} tracks deleted`);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Delete failed', 'error'),
  });

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedTracks = data?.tracks.filter((t) => selectedIds.has(t.id)) ?? [];

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

      {isAdmin && selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
          <span className="text-neutral-300">{selectedIds.size} selected</span>
          <button
            onClick={() => selectedTracks.forEach((t) => patchMutation.mutate({ id: t.id, patch: { hidden: true } }))}
            className="text-neutral-400 hover:text-neutral-100"
          >
            Hide
          </button>
          <button
            onClick={() =>
              selectedTracks.forEach((t) => patchMutation.mutate({ id: t.id, patch: { hidden: false } }))
            }
            className="text-neutral-400 hover:text-neutral-100"
          >
            Un-hide
          </button>
          <button onClick={() => setDeleteTargets(selectedTracks)} className="text-red-400 hover:text-red-300">
            Delete
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-neutral-500 hover:text-neutral-300">
            Clear
          </button>
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}
      {isError && <p className="text-sm text-red-400">Failed to load tracks.</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-800 text-neutral-500">
                <tr>
                  {isAdmin && <th className="w-8 px-3 py-2"></th>}
                  <th className="px-3 py-2 font-medium"></th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Artist</th>
                  <th className="px-3 py-2 font-medium">Album</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Format</th>
                  <th className="px-3 py-2 font-medium">Flags</th>
                  <th className="w-8 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.tracks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setActiveTrack({ id: t.id, tab: 'tags' })}
                    className="cursor-pointer border-b border-neutral-900 hover:bg-neutral-900/50"
                  >
                    {isAdmin && (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={() => toggleSelected(t.id)}
                          className="accent-neutral-100"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <TrackRowMenu
                        track={t}
                        isAdmin={isAdmin}
                        onEdit={() => setActiveTrack({ id: t.id, tab: 'tags' })}
                        onDiagnostics={() => setActiveTrack({ id: t.id, tab: 'diagnostics' })}
                        onToggleHidden={() => patchMutation.mutate({ id: t.id, patch: { hidden: !t.hidden } })}
                        onToggleNotRecommended={() =>
                          patchMutation.mutate({ id: t.id, patch: { notRecommended: !t.notRecommended } })
                        }
                        onDelete={() => setDeleteTargets([t])}
                      />
                    </td>
                  </tr>
                ))}
                {data.tracks.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 9 : 7} className="px-3 py-8 text-center text-neutral-500">
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

      {activeTrack && (
        <TrackDetailDrawer
          trackId={activeTrack.id}
          initialTab={activeTrack.tab}
          onClose={() => setActiveTrack(null)}
        />
      )}

      {deleteTargets && (
        <ConfirmDeleteDialog
          titles={deleteTargets.map((t) => t.title)}
          isDeleting={deleteMutation.isPending}
          onCancel={() => setDeleteTargets(null)}
          onConfirm={() => deleteMutation.mutate(deleteTargets.map((t) => t.id))}
        />
      )}
    </div>
  );
}
