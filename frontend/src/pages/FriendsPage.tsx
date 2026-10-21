import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { CoverArt } from '../components/CoverArt';
import { usePlayer } from '../components/PlayerBar';
import { useRoom } from '../components/RoomProvider';
import { Skeleton, SkeletonListRows } from '../components/Skeleton';
import { apiClient } from '../lib/apiClient';
import { formatSince } from '../lib/format';
import type { FeedItem, FeedPage, FriendListening, TrackSummary } from '../types/api';

/** Players check in every 10 s, so polling faster than this would show nothing new. */
const NOW_PLAYING_POLL_MS = 15_000;

/**
 * Friends' now playing and the activity feed (A239-A243). Everyone on the server sees everyone (A240); "Hide my
 * activity" takes you out of both (A241). A tab on your own profile (owner, 2026-10-21), so guests, who have none,
 * never see it.
 */
export function FriendsPanel() {
  const { user, refreshUser } = useAuth();
  const { playTrack } = usePlayer();
  const { room, join } = useRoom();
  const navigate = useNavigate();

  const nowPlaying = useQuery({
    queryKey: ['social', 'now-playing'],
    queryFn: () => apiClient.get<{ listening: FriendListening[] }>('/social/now-playing'),
    refetchInterval: NOW_PLAYING_POLL_MS,
  });

  const feed = useInfiniteQuery({
    queryKey: ['social', 'feed'],
    queryFn: ({ pageParam }) =>
      apiClient.get<FeedPage>(pageParam ? `/social/feed?before=${encodeURIComponent(pageParam)}` : '/social/feed'),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
  });

  const hide = useMutation({
    mutationFn: (hidden: boolean) => apiClient.put('/me/activity-visibility', { hidden }),
    onSuccess: () => refreshUser(),
  });

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-blue-300">What everyone on this server is playing and liking.</p>
        {user && (
          <label className="flex items-center gap-2 text-sm text-blue-200">
            <input
              type="checkbox"
              checked={user.hideActivity}
              disabled={hide.isPending}
              onChange={(e) => hide.mutate(e.target.checked)}
              className="h-4 w-4 accent-orange-400"
            />
            Hide my activity
          </label>
        )}
      </div>
      {hide.isError && <p className="text-sm text-red-300">Could not save that. Try again.</p>}

      <section className="flex flex-col gap-2" aria-labelledby="friends-now">
        <h2 id="friends-now" className="text-sm font-semibold uppercase tracking-wide text-blue-300">
          Listening now
        </h2>
        {nowPlaying.isLoading && (
          <Skeleton label="Loading who is listening…">
            <SkeletonListRows rows={2} />
          </Skeleton>
        )}
        {nowPlaying.isError && <p className="text-sm text-red-300">Could not load who is listening.</p>}
        {nowPlaying.data?.listening.length === 0 && <p className="text-sm text-blue-400">Nobody else is playing anything.</p>}
        {nowPlaying.data && nowPlaying.data.listening.length > 0 && (
          <ul className="card divide-y divide-blue-800/60 overflow-hidden">
            {nowPlaying.data.listening.map((l) => (
              <li key={l.person.id} className="flex items-center gap-3 px-4 py-3">
                <Link to={`/people/${l.person.id}`} className="shrink-0" aria-label={`Open ${l.person.name}'s profile`}>
                  <Avatar userId={l.person.id} name={l.person.name} avatarId={l.person.avatarId} size="md" />
                </Link>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-blue-300">{l.person.name} is playing</span>
                  <TrackButton track={l.track} onPlay={playTrack} />
                  {l.track.duration ? (
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-blue-800" aria-hidden="true">
                      <span
                        className="block h-full bg-orange-400"
                        style={{ width: `${Math.min(100, (l.positionSeconds / l.track.duration) * 100)}%` }}
                      />
                    </span>
                  ) : null}
                </span>
                {/* They're in a Listen together room: join it, like a room link (A255). */}
                {l.roomCode && l.roomCode !== room?.code && (
                  <button
                    onClick={() => {
                      join(l.roomCode!);
                      navigate('/together');
                    }}
                    className="btn-secondary btn-sm shrink-0"
                    aria-label={`Join ${l.person.name}'s room${room ? ', leaving yours' : ''}`}
                  >
                    Join
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="friends-feed">
        <h2 id="friends-feed" className="text-sm font-semibold uppercase tracking-wide text-blue-300">
          Recently
        </h2>
        {feed.isLoading && (
          <Skeleton label="Loading activity…">
            <SkeletonListRows rows={5} />
          </Skeleton>
        )}
        {feed.isError && <p className="text-sm text-red-300">Could not load activity. Reload to try again.</p>}
        {feed.data && items.length === 0 && <p className="text-sm text-blue-400">No activity in the last 30 days.</p>}
        {items.length > 0 && (
          <ul className="card divide-y divide-blue-800/60 overflow-hidden">
            {items.map((item) => (
              <FeedRow key={feedKey(item)} item={item} now={feed.dataUpdatedAt} onPlay={playTrack} />
            ))}
          </ul>
        )}
        {feed.hasNextPage && (
          <button
            type="button"
            onClick={() => void feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            className="self-center text-sm text-blue-200 underline-offset-4 hover:underline"
          >
            {feed.isFetchingNextPage ? 'Loading…' : 'Show older'}
          </button>
        )}
      </section>
    </div>
  );
}

function feedKey(item: FeedItem): string {
  const ref = item.kind === 'playlist' ? item.playlist.id : item.track.id;
  return `${item.kind}:${item.person.id}:${ref}:${item.at}`;
}

const VERB = { play: 'played', like: 'liked', playlist: 'shared a playlist' } as const;

function FeedRow({ item, now, onPlay }: { item: FeedItem; now: number; onPlay: (t: TrackSummary) => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Link to={`/people/${item.person.id}`} className="shrink-0" aria-label={`Open ${item.person.name}'s profile`}>
        <Avatar userId={item.person.id} name={item.person.name} avatarId={item.person.avatarId} size="md" />
      </Link>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-blue-300">
          {item.person.name} {VERB[item.kind]} · {formatSince(item.at, now)}
        </span>
        {item.kind === 'playlist' ? (
          <Link to={`/playlists/${item.playlist.id}`} className="block truncate font-medium text-white hover:underline">
            {item.playlist.name}
            <span className="ml-2 text-xs font-normal text-blue-400">
              {item.playlist.trackCount} {item.playlist.trackCount === 1 ? 'song' : 'songs'}
            </span>
          </Link>
        ) : (
          <TrackButton track={item.track} onPlay={onPlay} />
        )}
      </span>
    </li>
  );
}

function TrackButton({ track, onPlay }: { track: TrackSummary; onPlay: (t: TrackSummary) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPlay(track)}
      className="flex w-full min-w-0 items-center gap-2 text-left"
      title={`Play ${track.title}`}
    >
      <CoverArt kind="tracks" id={track.id} className="h-8 w-8" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-white">{track.title}</span>
        {track.artist && <span className="block truncate text-xs text-blue-300">{track.artist}</span>}
      </span>
    </button>
  );
}
