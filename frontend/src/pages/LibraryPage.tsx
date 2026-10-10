import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ArcadeSelect } from '../components/ArcadeSelect';
import { useFavoriteIds } from '../components/FavoriteButton';
import { LibraryEmptyState } from '../components/LibraryEmptyState';
import { LibraryFull } from '../components/LibraryFull';
import { usePlayer } from '../components/PlayerBar';
import { apiClient } from '../lib/apiClient';
import { formatScanStatus } from '../lib/format';
import { loadLibraryView, saveLibraryView, type LibraryView } from '../lib/libraryView';
import type { LibraryRootListResponse, TrackListResponse, TrackSummary } from '../types/api';
import { Skeleton, SkeletonArcade } from '../components/Skeleton';

/** Roots re-poll interval while a scan runs; admin only, and only while scanning. */
const SCAN_POLL_MS = 2000;

/** The server's per-page cap (`MAX_LIMIT`); fewer round trips mean fewer stalls while scrolling. */
const PAGE_SIZE = 200;

/** The Simple view: just what you need to choose something to listen to. Sorting, filters and admin tools are in Full (A18). */
function SimpleLibrary() {
  const { user } = useAuth();
  const { playQueue } = usePlayer();
  const favoriteIds = useFavoriteIds();
  const [selected, setSelected] = useState(0);

  // Admin only (it exposes filesystem paths). Polls only while a scan runs; an idle library fetches once.
  const { data: rootsData } = useQuery({
    queryKey: ['library', 'roots', 'scan-status'],
    queryFn: () => apiClient.get<LibraryRootListResponse>('/library/roots'),
    enabled: Boolean(user?.isAdmin),
    refetchInterval: (query) => (query.state.data?.roots.some((r) => r.scanning) ? SCAN_POLL_MS : false),
  });

  const scanStatus = useMemo(() => {
    const scanningRoots = rootsData?.roots.filter((r) => r.scanning) ?? [];
    if (scanningRoots.length === 0) return '';
    // Summed only over roots with a count yet, so the number never seems to go backwards.
    const withProgress = scanningRoots.filter((r) => r.scanProgress);
    if (withProgress.length === 0) return formatScanStatus(true, null);
    const processed = withProgress.reduce((n, r) => n + (r.scanProgress?.processed ?? 0), 0);
    const total = withProgress.reduce((n, r) => n + (r.scanProgress?.total ?? 0), 0);
    return formatScanStatus(true, { processed, total });
  }, [rootsData]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey: ['tracks', 'arcade'],
      initialPageParam: 0,
      queryFn: ({ pageParam }) =>
        apiClient.get<TrackListResponse>(
          `/tracks?sort=title&order=asc&hidden=exclude&missing=all&limit=${PAGE_SIZE}&offset=${pageParam}`,
        ),
      // `undefined` is how this API says "there is no next page"; returning a
      // past-the-end offset instead would fetch an empty page forever.
      getNextPageParam: (last, pages) => {
        const loaded = pages.reduce((n, page) => n + page.tracks.length, 0);
        return loaded < last.total ? loaded : undefined;
      },
    });

  const tracks: TrackSummary[] = useMemo(
    () => data?.pages.flatMap((page) => page.tracks) ?? [],
    [data],
  );

  /** Loads the next page near the end. The `isFetchingNextPage` guard stops a wheel flick firing duplicates. */
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /** Missing files are left out of the queue, since one stalls it on a 500. */
  const play = useCallback(
    (index: number) => {
      const track = tracks[index];
      if (!track || track.missing) return;
      const playable = tracks.filter((candidate) => !candidate.missing);
      const start = playable.findIndex((candidate) => candidate.id === track.id);
      playQueue(playable, Math.max(0, start));
    },
    [tracks, playQueue],
  );

  if (isLoading) {
    return (
      <Skeleton label="Loading your library…">
        <SkeletonArcade />
      </Skeleton>
    );
  }

  if (isError) {
    return <p className="text-sm text-red-300">Could not load your library.</p>;
  }

  if (tracks.length === 0) {
    return <LibraryEmptyState />;
  }

  return (
    <ArcadeSelect
      tracks={tracks}
      favoriteIds={favoriteIds}
      selected={Math.min(selected, tracks.length - 1)}
      onSelect={setSelected}
      onPlay={play}
      isLoadingMore={isFetchingNextPage}
      onNearEnd={loadMore}
      scanStatus={scanStatus}
    />
  );
}

/** Simple or Full, per device (Simple by default). `?view=` wins so links land right; the toggle writes both. */
export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramView = searchParams.get('view');
  const view: LibraryView = paramView === 'full' || paramView === 'simple' ? paramView : loadLibraryView();

  function chooseView(next: LibraryView) {
    saveLibraryView(next);
    // The filters in the URL belong to the Full view; leaving it starts clean.
    setSearchParams(next === 'full' ? { view: 'full' } : {}, { replace: true });
  }

  return (
    <>
      <div className="library-toolbar">
        <div className="library-view-toggle" role="group" aria-label="Library view">
          {(['simple', 'full'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => chooseView(option)}
              className="library-view-option"
            >
              {option === 'simple' ? 'Simple' : 'Full'}
            </button>
          ))}
        </div>
      </div>
      {view === 'full' ? <LibraryFull /> : <SimpleLibrary />}
    </>
  );
}
