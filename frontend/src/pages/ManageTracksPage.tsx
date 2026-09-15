import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatDuration } from '../lib/format';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { AddToPlaylistDialog } from '../components/AddToPlaylistDialog';
import { CoverArt } from '../components/CoverArt';
import { FavoriteButton, useFavoriteIds } from '../components/FavoriteButton';
import { usePlayer } from '../components/PlayerBar';
import { useToast } from '../components/ToastProvider';
import { TrackDetailDrawer } from '../components/TrackDetailDrawer';
import { TrackRowMenu } from '../components/TrackRowMenu';
import { apiClient, ApiError } from '../lib/apiClient';
import { PlayIcon } from '../components/icons';
import type {
  SortField,
  SortOrder,
  TrackListParams,
  TrackListResponse,
  TrackSummary,
  VisibilityFilter,
} from '../types/api';

const PAGE_SIZE = 50;
const DEFAULT_SORT: SortField = 'title';
const DEFAULT_ORDER: SortOrder = 'asc';
const DEFAULT_HIDDEN: VisibilityFilter = 'exclude';
const DEFAULT_NOT_RECOMMENDED: VisibilityFilter = 'all';
// Matches the server's own default: a track nobody can play is not part of
// the library you browse.
const DEFAULT_MISSING: VisibilityFilter = 'exclude';
const SEARCH_DEBOUNCE_MS = 300;

function buildQuery(params: TrackListParams): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);
  if (params.order) qs.set('order', params.order);
  if (params.hidden) qs.set('hidden', params.hidden);
  if (params.notRecommended) qs.set('notRecommended', params.notRecommended);
  if (params.missing) qs.set('missing', params.missing);
  qs.set('limit', String(params.limit ?? PAGE_SIZE));
  qs.set('offset', String(params.offset ?? 0));
  return qs.toString();
}

const selectClass =
  'rounded-md border border-blue-700 bg-blue-950 px-2.5 py-2 text-sm text-blue-100 outline-none transition-colors hover:border-blue-400 focus:border-orange-600/60';

interface SortHeaderProps {
  field: SortField;
  label: string;
  activeSort: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
  align?: 'right';
}

/**
 * A clickable column header that sorts by `field`, with a direction arrow
 * once it's the active one. Kept at module scope rather than defined inside
 * `ManageTracksPage` — a component defined inside another's render body is a
 * new type on every render, so React would remount (and drop focus from) the
 * very button a click on it just triggered a re-render from.
 */
function SortHeader({ field, label, activeSort, order, onSort, align }: SortHeaderProps) {
  const isActive = activeSort === field;
  return (
    <th className={`py-2.5 font-medium ${align === 'right' ? 'pr-3 text-right' : ''}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-white ${
          align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        {label}
        {isActive && <span aria-hidden>{order === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

export function ManageTracksPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Every filter lives in the URL, not component state — a filtered view is
  // then a link: bookmarkable, shareable, and still there after a refresh.
  const search = searchParams.get('search') ?? '';
  const sort = (searchParams.get('sort') as SortField | null) ?? DEFAULT_SORT;
  const order = (searchParams.get('order') as SortOrder | null) ?? DEFAULT_ORDER;
  const hidden = (searchParams.get('hidden') as VisibilityFilter | null) ?? DEFAULT_HIDDEN;
  const notRecommended =
    (searchParams.get('notRecommended') as VisibilityFilter | null) ?? DEFAULT_NOT_RECOMMENDED;
  const missing = (searchParams.get('missing') as VisibilityFilter | null) ?? DEFAULT_MISSING;
  const page = Number(searchParams.get('page') ?? '0');

  /** Merges a patch into the URL's params; a `undefined` value removes that key. */
  function updateParams(patch: Record<string, string | undefined>, resetPage = true) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) next.delete(key);
          else next.set(key, value);
        }
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  // The textbox's own value — decoupled from `search` above so typing doesn't
  // fire a query on every keystroke. Only what's actually committed to the
  // URL (below, after a pause) is what the query reads.
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) next.set('search', searchInput);
          else next.delete('search');
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput, setSearchParams]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeTrack, setActiveTrack] = useState<{ id: number; tab: 'tags' | 'diagnostics' } | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<TrackSummary[] | null>(null);
  const [playlistTarget, setPlaylistTarget] = useState<TrackSummary | null>(null);

  const { playQueue } = usePlayer();
  const favoriteIds = useFavoriteIds();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = Boolean(user?.isAdmin);

  const params: TrackListParams = {
    search,
    sort,
    order,
    hidden,
    notRecommended,
    missing,
    offset: page * PAGE_SIZE,
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tracks', params],
    queryFn: () => apiClient.get<TrackListResponse>(`/tracks?${buildQuery(params)}`),
    placeholderData: (prev) => prev,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  /**
   * Play this track, with the rest of what is on screen queued behind it.
   *
   * Shared by the row and its play button, which is the point: two controls
   * that do the same thing must not be able to drift into doing it slightly
   * differently. Tracks whose file is gone are filtered out rather than skipped
   * at playback — queueing one stalls the queue on a 500 partway through, and
   * the listener is left staring at a player that stopped for no visible
   * reason.
   */
  function playFrom(track: TrackSummary) {
    if (track.missing) return;
    const playable = (data?.tracks ?? [track]).filter((candidate) => !candidate.missing);
    const start = playable.findIndex((candidate) => candidate.id === track.id);
    playQueue(playable, Math.max(0, start));
  }

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

  // Selecting "all" only ever means all on the loaded page — selections from
  // a previous page are left alone, so paging through and selecting a few
  // pages' worth doesn't require re-checking earlier pages first.
  function toggleSelectAllOnPage() {
    const pageIds = data?.tracks.map((t) => t.id) ?? [];
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const selectedTracks = data?.tracks.filter((t) => selectedIds.has(t.id)) ?? [];
  const allOnPageSelected =
    (data?.tracks.length ?? 0) > 0 && (data?.tracks.every((t) => selectedIds.has(t.id)) ?? false);

  function onSort(field: SortField) {
    updateParams({ sort: field, order: sort === field && order === 'asc' ? 'desc' : 'asc' });
  }

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Manage tracks</h1>
          <p className="mt-0.5 text-sm text-blue-300">
            {data ? `${data.total} track${data.total === 1 ? '' : 's'}` : 'Loading your library…'}
          </p>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative flex-1 min-w-56">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-400">
            ⌕
          </span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, artist, album…"
            className="input pl-8"
          />
        </div>
        <div className="h-6 w-px bg-blue-800" />
        <select
          value={hidden}
          onChange={(e) => updateParams({ hidden: e.target.value as VisibilityFilter })}
          className={selectClass}
        >
          <option value="exclude">Visible only</option>
          <option value="all">All (incl. hidden)</option>
          <option value="only">Hidden only</option>
        </select>
        <select
          value={notRecommended}
          onChange={(e) => updateParams({ notRecommended: e.target.value as VisibilityFilter })}
          className={selectClass}
        >
          <option value="all">All (recommended + not)</option>
          <option value="exclude">Recommended only</option>
          <option value="only">Not-recommended only</option>
        </select>
        <select
          value={missing}
          onChange={(e) => updateParams({ missing: e.target.value as VisibilityFilter })}
          className={selectClass}
        >
          <option value="exclude">Playable only</option>
          <option value="all">All (incl. missing)</option>
          <option value="only">Missing only</option>
        </select>
      </div>

      {isAdmin && selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-orange-600/30 bg-orange-600/6 px-3 py-2 text-sm">
          <span className="font-medium text-orange-500">{selectedIds.size} selected</span>
          <div className="ml-2 flex gap-1.5">
            <button
              onClick={() => selectedTracks.forEach((t) => patchMutation.mutate({ id: t.id, patch: { hidden: true } }))}
              className="btn-ghost btn-sm"
            >
              Hide
            </button>
            <button
              onClick={() =>
                selectedTracks.forEach((t) => patchMutation.mutate({ id: t.id, patch: { hidden: false } }))
              }
              className="btn-ghost btn-sm"
            >
              Un-hide
            </button>
            <button onClick={() => setDeleteTargets(selectedTracks)} className="btn-ghost btn-sm text-red-400!">
              Delete
            </button>
          </div>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-blue-300 hover:text-blue-100">
            Clear
          </button>
        </div>
      )}

      {isLoading && (
        <div className="card flex items-center justify-center py-16 text-sm text-blue-300">Loading…</div>
      )}
      {isError && (
        <div className="card flex items-center justify-center py-16 text-sm text-red-400">
          Failed to load tracks.
        </div>
      )}

      {data && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-blue-800">
                <tr className="text-xs uppercase tracking-wide text-blue-400">
                  {isAdmin && (
                    <th className="w-10 py-2.5 pl-4">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        className="accent-orange-600"
                        aria-label="Select all tracks on this page"
                      />
                    </th>
                  )}
                  <th className="w-10 py-2.5"></th>
                  <th className="w-10 py-2.5"></th>
                  <SortHeader field="title" label="Title" activeSort={sort} order={order} onSort={onSort} />
                  <SortHeader field="artist" label="Artist" activeSort={sort} order={order} onSort={onSort} />
                  <SortHeader field="album" label="Album" activeSort={sort} order={order} onSort={onSort} />
                  <SortHeader
                    field="duration"
                    label="Duration"
                    activeSort={sort}
                    order={order}
                    onSort={onSort}
                    align="right"
                  />
                  <SortHeader
                    field="playCount"
                    label="Plays"
                    activeSort={sort}
                    order={order}
                    onSort={onSort}
                    align="right"
                  />
                  <SortHeader field="dateAdded" label="Added" activeSort={sort} order={order} onSort={onSort} />
                  <th className="py-2.5 font-medium">Format</th>
                  <th className="py-2.5 font-medium">Flags</th>
                  <th className="w-10 py-2.5 pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-800/60">
                {data.tracks.map((t) => (
                  <tr
                    key={t.id}
                    /* Clicking a row plays it. It used to open the tag editor,
                       which spent the one gesture a phone has on the rarest
                       thing anybody does to a track — and on a touch screen
                       there is no hover to reveal an alternative. The editor
                       lost nothing: it was already in the row's ⋮ menu, which
                       is where an occasional admin action belongs. */
                    onClick={() => playFrom(t)}
                    className={`group transition-colors hover:bg-blue-800/40 ${
                      t.missing ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    {isAdmin && (
                      <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={() => toggleSelected(t.id)}
                          className="accent-orange-600"
                        />
                      </td>
                    )}
                    <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                      <FavoriteButton trackId={t.id} isFavorited={favoriteIds.has(t.id)} />
                    </td>
                    <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => playFrom(t)}
                        disabled={t.missing}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-blue-300 opacity-70 transition-all group-hover:opacity-100 hover:bg-orange-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-blue-300"
                        aria-label={t.missing ? `${t.title} is missing from disk` : `Play ${t.title}`}
                        title={t.missing ? 'The file for this track is missing from disk' : undefined}
                      >
                        <PlayIcon className="h-3 w-3" />
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-white">
                      <div className="flex items-center gap-2.5">
                        <CoverArt kind="tracks" id={t.id} className="h-9 w-9" />
                        <span className="truncate">{t.title}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-blue-200">{t.artist ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-blue-200">{t.album ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-blue-200">
                      {formatDuration(t.duration)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-blue-300">
                      {t.playCount > 0 ? t.playCount : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-blue-300">{formatDate(t.dateAdded)}</td>
                    <td className="py-2.5 pr-3 text-blue-300">{t.format ?? '—'}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex gap-1">
                        {t.missing && <span className="badge-danger">missing</span>}
                        {t.hidden && <span className="badge-neutral">hidden</span>}
                        {t.notRecommended && <span className="badge-caution">not recommended</span>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                      <TrackRowMenu
                        track={t}
                        isAdmin={isAdmin}
                        onEdit={() => setActiveTrack({ id: t.id, tab: 'tags' })}
                        onDiagnostics={() => setActiveTrack({ id: t.id, tab: 'diagnostics' })}
                        onAddToPlaylist={() => setPlaylistTarget(t)}
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
                    <td colSpan={isAdmin ? 12 : 11} className="px-4 py-12 text-center text-blue-300">
                      No tracks match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-3 text-sm text-blue-300">
            <button
              disabled={page === 0}
              onClick={() => updateParams({ page: page > 1 ? String(page - 1) : undefined }, false)}
              className="btn-secondary btn-sm"
            >
              Prev
            </button>
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) }, false)}
              className="btn-secondary btn-sm"
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

      {playlistTarget && (
        <AddToPlaylistDialog
          trackId={playlistTarget.id}
          trackTitle={playlistTarget.title}
          onClose={() => setPlaylistTarget(null)}
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
