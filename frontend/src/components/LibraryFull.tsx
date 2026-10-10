import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiClient, ApiError } from '../lib/apiClient';
import { formatDate, formatDuration } from '../lib/format';
import type {
  SortField,
  SortOrder,
  TrackListParams,
  TrackListResponse,
  TrackSummary,
  VisibilityFilter,
} from '../types/api';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { CoverArt } from './CoverArt';
import { FavoriteButton, useFavoriteIds } from './FavoriteButton';
import { usePlayer } from './PlayerBar';
import { useToast } from './ToastProvider';
import { TrackDetailDrawer } from './TrackDetailDrawer';
import { TrackRowMenu } from './TrackRowMenu';
import { Skeleton, SkeletonTrackRows } from './Skeleton';

/** The server allows up to 200; the panel scrolls, so a smaller page keeps the
 *  first paint quick and the next one arrives before the bottom does. */
const PAGE_SIZE = 100;
/** Album order is what makes grouped blocks possible. */
const DEFAULT_SORT: SortField = 'album';
const DEFAULT_ORDER: SortOrder = 'asc';
const DEFAULT_HIDDEN: VisibilityFilter = 'exclude';
const DEFAULT_NOT_RECOMMENDED: VisibilityFilter = 'all';
// A track nobody can play is not part of the library you browse.
const DEFAULT_MISSING: VisibilityFilter = 'exclude';
const SEARCH_DEBOUNCE_MS = 300;
/** How close to the bottom of the panel, in px, before the next page is asked for. */
const LOAD_AHEAD_PX = 480;
/** Row height in rem; must match `.lf-td` in the stylesheet. */
const ROW_REM = 2.4;
const COVER_BLOCK_REM = 9;

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

interface AlbumGroup {
  key: string;
  album: string | null;
  artist: string | null;
  coverTrackId: number;
  seconds: number;
  tracks: TrackSummary[];
}

/** Consecutive runs of the same album. The list arrives sorted by album, so a
 *  run *is* an album; grouping is a view over the order, never a re-sort. */
function groupByAlbum(tracks: TrackSummary[]): AlbumGroup[] {
  const groups: AlbumGroup[] = [];
  for (const track of tracks) {
    const last = groups[groups.length - 1];
    if (last && last.album === track.album) {
      last.tracks.push(track);
      last.seconds += track.duration ?? 0;
    } else {
      groups.push({
        key: `${groups.length}:${track.album ?? ''}`,
        album: track.album,
        artist: track.artist,
        coverTrackId: track.id,
        seconds: track.duration ?? 0,
        tracks: [track],
      });
    }
  }
  return groups;
}

interface SortHeaderProps {
  field: SortField;
  label: string;
  activeSort: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
  className?: string;
  align?: 'right';
}

/** Module scope: defined inside a render, React would remount it and drop focus from the clicked button. */
function SortHeader({ field, label, activeSort, order, onSort, className = '', align }: SortHeaderProps) {
  const isActive = activeSort === field;
  return (
    <th className={`lf-th ${align === 'right' ? 'text-right' : ''} ${className}`}>
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

const selectClass =
  'min-w-0 flex-1 basis-36 rounded-md border border-blue-700 bg-blue-950 px-2.5 py-1.5 text-sm text-blue-100 outline-none transition-colors hover:border-blue-400 focus:border-orange-500';

/**
 * The album-grouped table: the Library's "Full" view. Non-admins see no admin controls, but the server is what
 * enforces it. Scrolls inside a fixed-height panel.
 */
export function LibraryFull() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const isGuest = Boolean(user?.isGuest);

  // Filters live in the URL, so a filtered view is a link.
  const search = searchParams.get('search') ?? '';
  const sort = (searchParams.get('sort') as SortField | null) ?? DEFAULT_SORT;
  const order = (searchParams.get('order') as SortOrder | null) ?? DEFAULT_ORDER;
  const hidden = isAdmin
    ? ((searchParams.get('hidden') as VisibilityFilter | null) ?? DEFAULT_HIDDEN)
    : DEFAULT_HIDDEN;
  const notRecommended =
    (searchParams.get('notRecommended') as VisibilityFilter | null) ?? DEFAULT_NOT_RECOMMENDED;
  const missing = (searchParams.get('missing') as VisibilityFilter | null) ?? DEFAULT_MISSING;

  function updateParams(patch: Record<string, string | undefined>) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  // The textbox's own value; only what reaches the URL after a pause queries.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) next.set('search', searchInput);
          else next.delete('search');
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

  const { playQueue, current } = usePlayer();
  const favoriteIds = useFavoriteIds();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const params: TrackListParams = { search, sort, order, hidden, notRecommended, missing };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: ['tracks', 'full', params],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiClient.get<TrackListResponse>(`/tracks?${buildQuery({ ...params, offset: pageParam })}`),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, page) => n + page.tracks.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: (prev) => prev,
  });

  const tracks: TrackSummary[] = useMemo(() => data?.pages.flatMap((page) => page.tracks) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const grouped = sort === 'album';
  const groups = useMemo(() => (grouped ? groupByAlbum(tracks) : []), [grouped, tracks]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMoreIfNear = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_AHEAD_PX) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // A tall panel may never scroll, so ask for more after each page.
  useEffect(() => {
    loadMoreIfNear();
  }, [tracks.length, loadMoreIfNear]);

  /** Plays this track with the loaded rest queued; missing files are left out, since one stalls the queue on a 500. */
  function playFrom(track: TrackSummary) {
    if (track.missing) return;
    const playable = tracks.filter((candidate) => !candidate.missing);
    const start = playable.findIndex((candidate) => candidate.id === track.id);
    playQueue(playable, Math.max(0, start));
  }

  function invalidateAfterMutation() {
    void queryClient.invalidateQueries({ queryKey: ['tracks'] });
  }

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<TrackSummary> }) =>
      apiClient.patch(`/tracks/${id}`, patch),
    onSuccess: invalidateAfterMutation,
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Update failed', 'error'),
  });

  const bulkHideMutation = useMutation({
    mutationFn: ({ ids, hidden }: { ids: number[]; hidden: boolean }) =>
      apiClient.patch<{ updated: number }>('/tracks', { ids, hidden }),
    onSuccess: invalidateAfterMutation,
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Update failed', 'error'),
  });

  // One request for any number of tracks; the server deletes what it can and lists the rest in `failed`.
  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiClient.post<{ deleted: number[]; failed: number[] }>('/tracks/delete', { ids }),
    onSuccess: ({ deleted, failed }) => {
      invalidateAfterMutation();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
      setDeleteTargets(null);
      if (failed.length > 0) {
        showToast(
          `${deleted.length} deleted. ${failed.length} couldn't be removed from disk and are still selected.`,
          'error',
        );
      } else {
        showToast(deleted.length === 1 ? 'Track deleted' : `${deleted.length} tracks deleted`);
      }
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

  // "All" means loaded rows only, so a bulk delete is never blind.
  function toggleSelectAllLoaded() {
    const ids = tracks.map((t) => t.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  const selectedTracks = tracks.filter((t) => selectedIds.has(t.id));
  const allLoadedSelected = tracks.length > 0 && tracks.every((t) => selectedIds.has(t.id));

  function onSort(field: SortField) {
    updateParams({ sort: field, order: sort === field && order === 'asc' ? 'desc' : 'asc' });
  }

  // Ten columns either way (album and cover columns swap), plus the admin checkbox.
  const columnCount = 10 + (isAdmin ? 1 : 0);

  function renderRow(t: TrackSummary, number: number, cover: ReactNode) {
    const isCurrent = current?.id === t.id;
    return (
      <tr
        key={t.id}
        // A row tap plays; editing lives in the ⋮ menu.
        onClick={() => playFrom(t)}
        className={`lf-row ${isCurrent ? 'is-current' : ''} ${t.missing ? 'is-missing' : ''}`}
      >
        {cover}
        {isAdmin && (
          <td className="lf-td w-8 pl-3" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selectedIds.has(t.id)}
              onChange={() => toggleSelected(t.id)}
              className="accent-orange-600"
              aria-label={`Select ${t.title}`}
            />
          </td>
        )}
        <td className="lf-td w-8 text-center" onClick={(e) => e.stopPropagation()}>
          <FavoriteButton trackId={t.id} isFavorited={favoriteIds.has(t.id)} />
        </td>
        <td className="lf-td w-8 text-center font-mono text-xs tabular-nums lf-num">{number}</td>
        <td className="lf-td max-w-0 font-medium">
          <div className="flex items-center gap-2.5">
            {!grouped && <CoverArt kind="tracks" id={t.id} className="h-8 w-8 shrink-0" />}
            <span className="truncate">{t.title}</span>
          </div>
        </td>
        <td className="lf-td hidden max-w-0 truncate md:table-cell lf-muted">{t.artist ?? '—'}</td>
        {!grouped && <td className="lf-td hidden max-w-0 truncate lg:table-cell lf-muted">{t.album ?? '—'}</td>}
        <td className="lf-td w-16 text-right font-mono text-xs tabular-nums lf-muted">{formatDuration(t.duration)}</td>
        <td className="lf-td hidden w-24 pl-4 lg:table-cell lf-muted">{formatDate(t.dateAdded)}</td>
        <td className="lf-td hidden w-16 md:table-cell lf-muted">{t.format ?? '—'}</td>
        <td className="lf-td hidden w-px whitespace-nowrap sm:table-cell">
          <div className="flex gap-1">
            {t.missing && <span className="badge-danger">missing</span>}
            {t.hidden && <span className="badge-neutral">hidden</span>}
            {t.notRecommended && <span className="badge-caution">not recommended</span>}
          </div>
        </td>
        <td className="lf-td w-10 pr-3" onClick={(e) => e.stopPropagation()}>
          <TrackRowMenu
            track={t}
            isAdmin={isAdmin}
            onEdit={() => setActiveTrack({ id: t.id, tab: 'tags' })}
            onDiagnostics={() => setActiveTrack({ id: t.id, tab: 'diagnostics' })}
            onAddToPlaylist={isGuest ? undefined : () => setPlaylistTarget(t)}
            onToggleHidden={() => patchMutation.mutate({ id: t.id, patch: { hidden: !t.hidden } })}
            onToggleNotRecommended={() =>
              patchMutation.mutate({ id: t.id, patch: { notRecommended: !t.notRecommended } })
            }
            onDelete={() => setDeleteTargets([t])}
          />
        </td>
      </tr>
    );
  }

  return (
    <div className="lf">
      <div className="lf-toolbar">
        <div className="relative min-w-48 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-400">⌕</span>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, artist, album…"
            className="input py-1.5 pl-8"
          />
        </div>
        {isAdmin && (
          <select
            value={hidden}
            onChange={(e) => updateParams({ hidden: e.target.value })}
            className={selectClass}
            aria-label="Hidden tracks"
          >
            <option value="exclude">Visible only</option>
            <option value="all">All (incl. hidden)</option>
            <option value="only">Hidden only</option>
          </select>
        )}
        <select
          value={notRecommended}
          onChange={(e) => updateParams({ notRecommended: e.target.value })}
          className={selectClass}
          aria-label="Recommendation"
        >
          <option value="all">All (recommended + not)</option>
          <option value="exclude">Recommended only</option>
          <option value="only">Not-recommended only</option>
        </select>
        <select
          value={missing}
          onChange={(e) => updateParams({ missing: e.target.value })}
          className={selectClass}
          aria-label="Missing files"
        >
          <option value="exclude">Playable only</option>
          <option value="all">All (incl. missing)</option>
          <option value="only">Missing only</option>
        </select>
      </div>

      {isAdmin && selectedIds.size > 0 && (
        <div className="lf-bulk">
          <span className="font-medium text-accent-ink">{selectedIds.size} selected</span>
          <div className="ml-2 flex gap-1.5">
            <button
              onClick={() => bulkHideMutation.mutate({ ids: selectedTracks.map((t) => t.id), hidden: true })}
              disabled={bulkHideMutation.isPending}
              className="btn-ghost btn-sm"
            >
              Hide
            </button>
            <button
              onClick={() => bulkHideMutation.mutate({ ids: selectedTracks.map((t) => t.id), hidden: false })}
              disabled={bulkHideMutation.isPending}
              className="btn-ghost btn-sm"
            >
              Un-hide
            </button>
            <button onClick={() => setDeleteTargets(selectedTracks)} className="btn-ghost btn-sm text-red-300!">
              Delete
            </button>
          </div>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-blue-300 hover:text-blue-100">
            Clear
          </button>
        </div>
      )}

      <div className="lf-scroll" ref={scrollRef} onScroll={loadMoreIfNear}>
        {isLoading && (
          <Skeleton label="Loading tracks…">
            <SkeletonTrackRows rows={14} bare />
          </Skeleton>
        )}
        {isError && <p className="lf-state text-red-300">Failed to load tracks.</p>}
        {data && tracks.length === 0 && <p className="lf-state">No tracks match these filters.</p>}

        {tracks.length > 0 && (
          <table className="lf-table">
            <thead>
              <tr>
                {grouped && <th className="lf-th hidden w-0 p-0 sm:table-cell" aria-hidden />}
                {isAdmin && (
                  <th className="lf-th w-8 pl-3">
                    <input
                      type="checkbox"
                      checked={allLoadedSelected}
                      onChange={toggleSelectAllLoaded}
                      className="accent-orange-600"
                      aria-label="Select all loaded tracks"
                    />
                  </th>
                )}
                <th className="lf-th w-8" />
                <th className="lf-th w-8 text-center">#</th>
                <SortHeader field="title" label="Title" activeSort={sort} order={order} onSort={onSort} />
                <SortHeader
                  field="artist"
                  label="Artist"
                  activeSort={sort}
                  order={order}
                  onSort={onSort}
                  className="hidden md:table-cell"
                />
                {!grouped && (
                  <SortHeader
                    field="album"
                    label="Album"
                    activeSort={sort}
                    order={order}
                    onSort={onSort}
                    className="hidden lg:table-cell"
                  />
                )}
                <SortHeader
                  field="duration"
                  label="Length"
                  activeSort={sort}
                  order={order}
                  onSort={onSort}
                  align="right"
                />
                <SortHeader
                  field="dateAdded"
                  label="Added"
                  activeSort={sort}
                  order={order}
                  onSort={onSort}
                  className="hidden pl-4 lg:table-cell"
                />
                <th className="lf-th hidden md:table-cell">Format</th>
                <th className="lf-th hidden sm:table-cell" />
                <th className="lf-th w-10" />
              </tr>
            </thead>

            {grouped
              ? groups.map((group) => (
                  <tbody key={group.key} className="lf-group">
                    <tr className="lf-group-head">
                      <td colSpan={columnCount}>
                        <div className="lf-group-line">
                          <span className="lf-group-title">{group.album ?? 'No album'}</span>
                          <span className="lf-group-meta">
                            {group.tracks.length} / {formatDuration(group.seconds)}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.tracks.map((t, i) =>
                      renderRow(
                        t,
                        i + 1,
                        i === 0 ? (
                          <td rowSpan={group.tracks.length + 1} className="lf-cover-cell hidden sm:table-cell">
                            <div className="lf-cover-box">
                              <CoverArt kind="tracks" id={group.coverTrackId} className="lf-cover" bare />
                              <p className="lf-cover-caption">
                                {group.artist && <span>{group.artist}</span>}
                                {group.album && <span>{group.album}</span>}
                              </p>
                            </div>
                          </td>
                        ) : null,
                      ),
                    )}
                    {/* The cover is absolute, so this row keeps a short album at least cover height. */}
                    <tr className="lf-filler hidden sm:table-row" style={{ height: `${Math.max(0, COVER_BLOCK_REM - group.tracks.length * ROW_REM)}rem` }}>
                      <td colSpan={columnCount - 1} />
                    </tr>
                  </tbody>
                ))
              : (
                  <tbody>{tracks.map((t, i) => renderRow(t, i + 1, null))}</tbody>
                )}
          </table>
        )}
      </div>

      <div className="lf-footer">
        <span>{isFetchingNextPage ? 'Loading more…' : ''}</span>
        <span className="ml-auto">
          {tracks.length} of {total} loaded
        </span>
      </div>

      {activeTrack && (
        <TrackDetailDrawer trackId={activeTrack.id} initialTab={activeTrack.tab} onClose={() => setActiveTrack(null)} />
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
