import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ArcadeSelect } from '../components/ArcadeSelect';
import { useFavoriteIds } from '../components/FavoriteButton';
import { usePlayer } from '../components/PlayerBar';
import { apiClient } from '../lib/apiClient';
import type { HealthSnapshot, TrackListResponse, TrackSummary } from '../types/api';

/**
 * How often the empty state checks whether a scan is still running. Only
 * polled while the library is actually empty — a real library never pays for
 * this once tracks exist.
 */
const SCAN_POLL_MS = 2000;

/**
 * The server caps a page at 200 (`MAX_LIMIT` in `backend/src/utils/pagination.ts`).
 * Asking for exactly that is deliberate: the strip is a continuous list and
 * every round trip is a stall in the middle of scrolling, so the right number
 * of requests is the smallest the server will allow.
 */
const PAGE_SIZE = 200;

/**
 * The library, as a music select rather than a table.
 *
 * The table did not shrink into this — it moved. Sorting, the four filters, the
 * per-row flags and the admin bulk actions all still exist, on `/manage`, which
 * is where someone doing maintenance already is. Trying to keep them here would
 * have produced a screen that was neither a listening surface nor a management
 * one; the decision is recorded as A18 in the questions ledger.
 *
 * What is here is what you need to choose something to listen to.
 */
export function LibraryPage() {
  const { user } = useAuth();
  const { playQueue } = usePlayer();
  const favoriteIds = useFavoriteIds();
  const [selected, setSelected] = useState(0);

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

  // Whether a scan is running right now — `/admin/health` is open to any
  // signed-in user (guest included), unlike the root-management endpoints
  // themselves, so this works from the one screen every kind of visitor
  // actually lands on. Only polled once the library turns out to be empty.
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthSnapshot>('/admin/health'),
    refetchInterval: SCAN_POLL_MS,
    enabled: !isLoading && tracks.length === 0,
  });

  if (isLoading) {
    return <p className="text-sm text-blue-300">Loading your library…</p>;
  }

  if (isError) {
    return <p className="text-sm text-red-300">Could not load your library.</p>;
  }

  if (tracks.length === 0) {
    if (health?.librarySyncRunning) {
      return (
        <div className="py-16 text-center">
          <p className="text-lg text-blue-100">Scanning for music…</p>
          <div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-blue-800">
            <div className="scan-sweep h-full w-2/5 rounded-full bg-orange-600" />
          </div>
        </div>
      );
    }

    return (
      <div className="py-16 text-center">
        <p className="text-lg text-blue-100">No music in the library yet.</p>
        {user?.isAdmin ? (
          <p className="mt-1 text-sm text-blue-400">
            Add a folder in{' '}
            <Link to="/options" className="text-orange-500 underline hover:text-orange-400">
              Options
            </Link>{' '}
            and it will show up here.
          </p>
        ) : (
          <p className="mt-1 text-sm text-blue-400">Ask an admin to add some.</p>
        )}
      </div>
    );
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
    />
  );
}
