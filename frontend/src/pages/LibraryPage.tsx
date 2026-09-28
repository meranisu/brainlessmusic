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

/** How often to re-poll `/library/roots` while a scan is running, so the
 *  strip's own status line moves along with it. Admin-only and only while
 *  something is actually scanning — see `scanStatus` below — so this never
 *  runs for a guest or an idle library. */
const SCAN_POLL_MS = 2000;

/**
 * The server caps a page at 200 (`MAX_LIMIT` in `backend/src/utils/pagination.ts`).
 * Asking for exactly that is deliberate: the strip is a continuous list and
 * every round trip is a stall in the middle of scrolling, so the right number
 * of requests is the smallest the server will allow.
 */
const PAGE_SIZE = 200;

/**
 * The library as a music select — the "Simple" side of the toggle.
 *
 * What is here is what you need to choose something to listen to. Sorting,
 * the filters, the per-row flags and the admin bulk actions live in the
 * "Full" view (`LibraryFull`), one toggle away; trying to keep them here would
 * have produced a screen that was neither a listening surface nor a
 * management one (A18 in the questions ledger).
 */
function SimpleLibrary() {
  const { user } = useAuth();
  const { playQueue } = usePlayer();
  const favoriteIds = useFavoriteIds();
  const [selected, setSelected] = useState(0);

  // `/library/roots` is admin-only server-side (it exposes real filesystem
  // paths), so this is skipped entirely for anyone else rather than firing a
  // request that can only 403. Polls only while something is scanning —
  // `refetchInterval` reads the *last fetched* data to decide the next
  // delay, so a scan that starts or finishes between polls is caught within
  // one interval either way, and an idle library polls a grand total of once.
  const { data: rootsData } = useQuery({
    queryKey: ['library', 'roots', 'scan-status'],
    queryFn: () => apiClient.get<LibraryRootListResponse>('/library/roots'),
    enabled: Boolean(user?.isAdmin),
    refetchInterval: (query) => (query.state.data?.roots.some((r) => r.scanning) ? SCAN_POLL_MS : false),
  });

  const scanStatus = useMemo(() => {
    const scanningRoots = rootsData?.roots.filter((r) => r.scanning) ?? [];
    if (scanningRoots.length === 0) return '';
    // Only summed across roots that have a count yet — one root deep into
    // its walk and another still listing directories shouldn't make the
    // number look like it went backwards.
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

  /**
   * Pulls the next page when the selection nears the end of what is loaded.
   *
   * Guarded on `hasNextPage` *and* `isFetchingNextPage`: the strip calls this
   * on every selection change while it is near the tail, so without the second
   * guard a single flick of the wheel would fire several identical requests
   * before the first came back.
   */
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /** Missing files are filtered out of the queue rather than skipped at
   *  playback — queueing one stalls the queue on a 500 partway through. */
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
    return <p className="text-sm text-blue-300">Loading your library…</p>;
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

/**
 * The Library page: the arcade select (Simple) or the album-grouped table
 * (Full), for every signed-in user.
 *
 * The choice is per device (`localStorage`, Simple by default). `?view=` beats
 * the stored choice so a link — including the old `/manage` redirect — lands on
 * the view it names, and the toggle writes both, so the address bar and the
 * saved preference never disagree after a click.
 */
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
