import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ArcadeSelect } from '../components/ArcadeSelect';
import { useFavoriteIds } from '../components/FavoriteButton';
import { LibraryEmptyState } from '../components/LibraryEmptyState';
import { LibraryFull } from '../components/LibraryFull';
import { usePlayer } from '../components/PlayerBar';
import { useToast } from '../components/ToastProvider';
import { apiClient } from '../lib/apiClient';
import { formatScanStatus } from '../lib/format';
import { useLetterIndex } from '../lib/letterIndex';
import { loadLibraryView, saveLibraryView, type LibraryView } from '../lib/libraryView';
import type { LibraryRootListResponse, TrackListResponse, TrackSummary } from '../types/api';
import { Skeleton, SkeletonArcade } from '../components/Skeleton';

/** Roots re-poll interval while a scan runs; admin only, and only while scanning. */
const SCAN_POLL_MS = 2000;

/** The server's per-page cap (`MAX_LIMIT`); fewer round trips mean fewer stalls while scrolling. */
const PAGE_SIZE = 200;

/** Pages kept loaded around the selection: this many before the one holding it, and this many after. */
const PAGES_BEFORE = 1;
const PAGES_AFTER = 2;

/** One page of the library list. The same key and fetch serve the strip and Play, so a page loads once. */
const pageQuery = (page: number) => ({
  queryKey: ['tracks', 'arcade', page],
  queryFn: () =>
    apiClient.get<TrackListResponse>(
      `/tracks?sort=title&order=asc&hidden=exclude&missing=all&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    ),
  staleTime: 30_000,
});

/** Kept outside the component so `useQueries` can reuse its answer while no page has changed. */
const dataOf = (results: { data?: TrackListResponse }[]) => results.map((r) => r.data);

/** The Simple view: just what you need to choose something to listen to. Sorting, filters and admin tools are in Full (A18). */
function SimpleLibrary() {
  const { user } = useAuth();
  const { playQueue } = usePlayer();
  const { showToast } = useToast();
  const favoriteIds = useFavoriteIds();
  const [selected, setSelected] = useState(0);

  // Admin only (it exposes filesystem paths). Polls only while a scan runs; an idle library fetches once.
  const { data: rootsData } = useQuery({
    queryKey: ['library', 'roots', 'scan-status'],
    queryFn: () => apiClient.get<LibraryRootListResponse>('/library/roots'),
    enabled: Boolean(user?.isAdmin),
    refetchInterval: (query) => (query.state.data?.roots.some((r) => r.scanning) ? SCAN_POLL_MS : false),
  });

  // A scan that ends while this page is open adds or drops tracks: refresh the lists and the totals line.
  const queryClient = useQueryClient();
  const anyScanning = rootsData?.roots.some((r) => r.scanning) ?? false;
  const wasScanningRef = useRef(false);
  useEffect(() => {
    if (wasScanningRef.current && !anyScanning) void queryClient.invalidateQueries({ queryKey: ['tracks'] });
    wasScanningRef.current = anyScanning;
  }, [anyScanning, queryClient]);

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

  // The list is as long as the server says, but only the pages near the selection are loaded: a jump to Z fetches the
  // pages around Z, not every page before it. Page 0 stays for the total.
  const first = useQuery(pageQuery(0));
  const total = first.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const shown = Math.min(selected, Math.max(total - 1, 0));
  const shownPage = Math.floor(shown / PAGE_SIZE);
  const wanted = useMemo(() => {
    const pages: number[] = [];
    for (let p = shownPage - PAGES_BEFORE; p <= shownPage + PAGES_AFTER; p++) if (p >= 1 && p <= lastPage) pages.push(p);
    return pages;
  }, [shownPage, lastPage]);
  const nearby = useQueries({ queries: wanted.map(pageQuery), combine: dataOf });

  const pages = useMemo(() => {
    const byPage = new Map<number, TrackSummary[]>();
    if (first.data) byPage.set(0, first.data.tracks);
    nearby.forEach((page, i) => {
      if (page) byPage.set(wanted[i], page.tracks);
    });
    return byPage;
  }, [first.data, nearby, wanted]);

  const getTrack = useCallback(
    (index: number): TrackSummary | undefined => pages.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE],
    [pages],
  );
  const loaded = useMemo(
    () =>
      [...pages.entries()]
        .sort(([a], [b]) => a - b)
        .flatMap(([page, tracks]) => tracks.map((track, i) => ({ index: page * PAGE_SIZE + i, track }))),
    [pages],
  );
  const letterIndex = useLetterIndex();

  /**
   * Plays from the song at `index`. The queue is the pages around it (one before, two after, about 800 songs), not
   * the whole library, so Play works as well far down the list as at the top. Missing files are left out, since one
   * stalls the queue on a 500.
   */
  const play = useCallback(
    async (index: number) => {
      const page = Math.floor(index / PAGE_SIZE);
      const from = Math.max(0, page - PAGES_BEFORE);
      const to = Math.min(lastPage, page + PAGES_AFTER);
      try {
        const results = await Promise.all(
          Array.from({ length: to - from + 1 }, (_, i) => queryClient.fetchQuery(pageQuery(from + i))),
        );
        const run = results.flatMap((result) => result.tracks);
        const track = run[index - from * PAGE_SIZE];
        if (!track || track.missing) return;
        const playable = run.filter((candidate) => !candidate.missing);
        playQueue(playable, Math.max(0, playable.findIndex((candidate) => candidate.id === track.id)));
      } catch {
        showToast("Couldn't load those songs to play. Try again.", 'error');
      }
    },
    [lastPage, queryClient, playQueue, showToast],
  );

  if (first.isLoading) {
    return (
      <Skeleton label="Loading your library…">
        <SkeletonArcade />
      </Skeleton>
    );
  }

  if (first.isError) {
    return <p className="text-sm text-red-300">Could not load your library.</p>;
  }

  if (total === 0) {
    return <LibraryEmptyState />;
  }

  return (
    <ArcadeSelect
      total={total}
      getTrack={getTrack}
      loaded={loaded}
      letters={letterIndex.data?.letters}
      favoriteIds={favoriteIds}
      selected={shown}
      onSelect={setSelected}
      onPlay={play}
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
