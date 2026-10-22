import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { CoverArt } from '../components/CoverArt';
import { MixCover } from '../components/MixCover';
import { usePlayer } from '../components/PlayerBar';
import { useRoom } from '../components/RoomProvider';
import { Shelf, ShelfCard } from '../components/Shelf';
import { usePlayCollection } from '../hooks/usePlayCollection';
import { apiClient } from '../lib/apiClient';
import { loadHomeLayout, type HomeShelfId } from '../lib/homeShelves';
import { loadJumpEntries, type JumpEntry } from '../lib/jumpBackIn';
import { fetchDailyMixes, fetchRadio, type DailyMix } from '../lib/mix';
import { fetchOnThisDay } from '../lib/onThisDay';
import type {
  AlbumDetail,
  AlbumListResponse,
  FriendListening,
  HistoryPage,
  MyStats,
  PlaylistDetail,
  PlaylistSummary,
  PublicPlaylistSummary,
} from '../types/api';

/** As often as the Friends tab asks, so a friend's card changes song about when theirs does. */
const NOW_PLAYING_POLL_MS = 15_000;

/** How many cards a shelf holds; a shelf is a taste, its See all page the whole thing. */
const SHELF_SIZE = 12;

/** Quick picks is a grid of this many, as Spotify's top grid is. */
const QUICK_PICKS = 6;

/** A playlist's picture: its first four albums as a grid, one when it has fewer, an empty square when none. */
function PlaylistPicture({ albumIds }: { albumIds: number[] }) {
  if (albumIds.length === 0) {
    return <span aria-hidden className="block aspect-square w-full rounded-md border border-blue-700 bg-blue-950" />;
  }
  if (albumIds.length < 4) {
    return <CoverArt kind="albums" id={albumIds[0]} size="full" className="aspect-square h-auto w-full" />;
  }
  return (
    <span className="grid aspect-square w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-md border border-blue-800">
      {albumIds.slice(0, 4).map((id) => (
        <CoverArt key={id} kind="albums" id={id} size="full" bare className="h-full w-full" />
      ))}
    </span>
  );
}

/** A shelf still loading: the row's shape, held back like every skeleton so a fast load never flashes it. */
function ShelfLoading({ title }: { title: string }) {
  return (
    <div role="status" className="skeleton-delay flex flex-col gap-3">
      <span className="sr-only">Loading {title}…</span>
      <span aria-hidden className="skeleton block h-5 w-40" />
      <div aria-hidden className="shelf-row overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="flex flex-col gap-2 p-2">
            <span className="skeleton block aspect-square w-full rounded-md" />
            <span className="skeleton block h-3.5 w-3/4" />
            <span className="skeleton block h-3 w-1/2" />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * One shelf's states around its cards: loading, an error with a retry, nothing at all when empty (a shelf with
 * nothing to offer is left out, not apologised for), and the shelf itself.
 */
function ShelfState({
  title,
  query,
  isEmpty,
  children,
}: {
  title: string;
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  isEmpty: boolean;
  children: ReactNode;
}) {
  if (query.isLoading) return <ShelfLoading title={title} />;
  if (query.isError) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-red-300">
          Could not load this.{' '}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-blue-100 underline underline-offset-2 hover:text-white"
          >
            Try again
          </button>
        </p>
      </section>
    );
  }
  if (isEmpty) return null;
  return <>{children}</>;
}

/**
 * One Jump back in card: the album, playlist or mix you left, opened by the card and resumed at your song by its play
 * key (A281). The detail comes through the page's own query, so opening it after costs nothing. Gone from the server,
 * or a mix no longer in today's, and the card is left out.
 */
function JumpCard({ entry, mixes, index }: { entry: JumpEntry; mixes: DailyMix[]; index: number }) {
  const { playAlbum, playPlaylist } = usePlayCollection();
  const { startRadio, inRoom } = usePlayer();
  const album = useQuery({
    queryKey: ['album', entry.id],
    queryFn: () => apiClient.get<AlbumDetail>(`/albums/${entry.id}`),
    enabled: entry.kind === 'album',
  });
  const playlist = useQuery({
    queryKey: ['playlist', entry.id],
    queryFn: () => apiClient.get<PlaylistDetail>(`/playlists/${entry.id}`),
    enabled: entry.kind === 'playlist',
  });

  if (entry.kind === 'mix') {
    const mix = mixes.find((m) => m.id === entry.id);
    if (!mix) return null;
    const at = Math.max(0, mix.tracks.findIndex((t) => t.id === entry.trackId));
    return (
      <ShelfCard
        index={index}
        to={`/mixes/${mix.id}`}
        picture={<MixCover tracks={mix.tracks} fill />}
        title={`${mix.name} mix`}
        subtitle={`At ${mix.tracks[at]?.title ?? 'the start'}`}
        onPlay={() => startRadio(mix.tracks[0], mix.tracks.slice(at), { kind: 'mix', id: mix.id })}
        playLabel={`Carry on with the ${mix.name} mix`}
        disabled={inRoom}
      />
    );
  }

  if (entry.kind === 'album') {
    if (!album.data) return null;
    const song = album.data.tracks.find((t) => t.id === entry.trackId);
    return (
      <ShelfCard
        index={index}
        to={`/albums/${entry.id}`}
        picture={<CoverArt kind="albums" id={entry.id} size="full" className="aspect-square h-auto w-full" />}
        title={album.data.title}
        subtitle={song ? `At ${song.title}` : (album.data.artistName ?? 'Unknown Artist')}
        onPlay={() => void playAlbum(entry.id, entry.trackId)}
        playLabel={`Carry on with ${album.data.title}`}
        disabled={inRoom}
      />
    );
  }

  if (!playlist.data) return null;
  const song = playlist.data.tracks.find((t) => t.id === entry.trackId);
  return (
    <ShelfCard
      index={index}
      to={`/playlists/${entry.id}`}
      picture={
        <PlaylistPicture
          albumIds={[
            ...new Set(playlist.data.tracks.map((t) => t.albumId).filter((id): id is number => id != null)),
          ].slice(0, 4)}
        />
      }
      title={playlist.data.name}
      subtitle={song ? `At ${song.title}` : 'Playlist'}
      onPlay={() => void playPlaylist(entry.id, entry.trackId)}
      playLabel={`Carry on with ${playlist.data.name}`}
      disabled={inRoom}
    />
  );
}

/**
 * Home (A276, A281): the app's front page, offering your music in shelves the way YT Music and Spotify do. Quick
 * picks, what you left part way, today's mixes, what you played, songs like your last, your playlists, friends playing
 * now, years back today, and the albums that arrived last; in the order and with the shelves set in Options. A guest has
 * no plays or friends of their own (A37), so they get the new albums and the public playlists.
 */
export function HomePage() {
  const { user } = useAuth();
  const isAccount = user != null && !user.isGuest;
  const { playQueue, playTrack, startRadio, inRoom } = usePlayer();
  const { playAlbum, playPlaylist } = usePlayCollection();
  const { room, join } = useRoom();
  const navigate = useNavigate();

  // Read once: Options is another page, so a change there is in place by the next visit.
  const [layout] = useState(loadHomeLayout);
  const shows = (id: HomeShelfId) => !layout.hidden.includes(id);
  const [jumps] = useState(() => (isAccount && user ? loadJumpEntries(user.id) : []));

  // Same keys and lifetimes as the Library's Mixes and On this day menus, so the two share one request.
  const mixes = useQuery({
    queryKey: ['mix', 'daily', user?.id],
    queryFn: fetchDailyMixes,
    staleTime: 30 * 60 * 1000,
    enabled: isAccount && (shows('mixes') || shows('jump-back-in')),
  });
  const today = new Date().toDateString();
  const onThisDay = useQuery({
    queryKey: ['on-this-day', user?.id, today],
    queryFn: fetchOnThisDay,
    staleTime: 30 * 60 * 1000,
    enabled: isAccount && shows('on-this-day'),
  });
  const history = useQuery({
    queryKey: ['home', 'history', user?.id],
    queryFn: () => apiClient.get<HistoryPage>('/me/history?limit=100'),
    enabled: isAccount && (shows('recent') || shows('because')),
  });
  const topThisMonth = useQuery({
    queryKey: ['home', 'quick-picks', user?.id],
    queryFn: () => apiClient.get<MyStats>(`/me/stats?range=month&limit=${QUICK_PICKS}`),
    staleTime: 10 * 60 * 1000,
    enabled: isAccount && shows('quick-picks'),
  });
  const playlists = useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiClient.get<{ playlists: PlaylistSummary[] }>('/playlists'),
    enabled: isAccount && shows('playlists'),
  });
  const publicPlaylists = useQuery({
    queryKey: ['playlists', 'public'],
    queryFn: () => apiClient.get<{ playlists: PublicPlaylistSummary[] }>('/playlists/public'),
    enabled: !isAccount,
  });
  const friends = useQuery({
    queryKey: ['social', 'now-playing'],
    queryFn: () => apiClient.get<{ listening: FriendListening[] }>('/social/now-playing'),
    refetchInterval: NOW_PLAYING_POLL_MS,
    enabled: isAccount && shows('friends'),
  });
  const newAlbums = useQuery({
    queryKey: ['albums', 'added', SHELF_SIZE],
    queryFn: () => apiClient.get<AlbumListResponse>(`/albums?sort=added&limit=${SHELF_SIZE}`),
  });

  // "Because you played": songs like the last one you played whose file is still there. One radio pick a day, so the
  // shelf doesn't reshuffle on every visit.
  const lastPlayed = history.data?.history.find((entry) => !entry.missing);
  const [daySeed] = useState(() => Math.floor(Date.now() / 86_400_000));
  const because = useQuery({
    queryKey: ['home', 'because', lastPlayed?.trackId, daySeed],
    queryFn: () => fetchRadio(lastPlayed!.trackId, daySeed, [lastPlayed!.trackId]),
    staleTime: 30 * 60 * 1000,
    enabled: isAccount && shows('because') && lastPlayed != null,
  });

  // Recently played as albums, newest first, each once: twenty plays of one album are one card. A song with no
  // album, or whose file is gone, has no page to open, so it is left out.
  const recentAlbums: { albumId: number; album: string; artist: string | null }[] = [];
  for (const entry of history.data?.history ?? []) {
    if (entry.albumId == null || entry.missing || recentAlbums.some((a) => a.albumId === entry.albumId)) continue;
    recentAlbums.push({ albumId: entry.albumId, album: entry.album ?? entry.title, artist: entry.artist });
    if (recentAlbums.length === SHELF_SIZE) break;
  }

  const years = (onThisDay.data?.years ?? [])
    .map((year) => ({ ...year, tracks: year.tracks.filter((track) => !track.missing) }))
    .filter((year) => year.tracks.length > 0);

  const mixList = mixes.data?.mixes ?? [];
  // A mix entry is only worth a card while that mix is still today's.
  const jumpList = jumps.filter((entry) => entry.kind !== 'mix' || mixList.some((m) => m.id === entry.id));
  const picks = (topThisMonth.data?.topTracks ?? []).map((t) => t.track).filter((track) => !track.missing);
  const mine = playlists.data?.playlists ?? [];
  const shared = publicPlaylists.data?.playlists ?? [];
  const listening = friends.data?.listening ?? [];
  const albums = newAlbums.data?.albums ?? [];
  const radio = because.data ?? [];

  const shelves: Record<HomeShelfId, ReactNode> = {
    'quick-picks': isAccount && (
      <ShelfState title="Quick picks" query={topThisMonth} isEmpty={picks.length === 0}>
        <section aria-labelledby="quick-picks" className="flex flex-col gap-3">
          <div>
            <h2 id="quick-picks" className="text-lg font-semibold text-white">
              Quick picks
            </h2>
            <p className="text-xs text-blue-300">What you played most this month. Tap one to play all six from there.</p>
          </div>
          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {picks.map((track, i) => (
              <li key={track.id} className="motion-rise" style={{ '--i': i } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => playQueue(picks, i)}
                  disabled={inRoom}
                  className="quick-pick group"
                >
                  <CoverArt kind="tracks" id={track.id} className="h-10 w-10 sm:h-12 sm:w-12" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-white group-hover:text-orange-400">
                      {track.title}
                    </span>
                    <span className="block truncate text-xs text-blue-300">{track.artist ?? 'Unknown Artist'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </ShelfState>
    ),

    'jump-back-in': isAccount && jumpList.length > 0 && (
      <Shelf title="Jump back in" detail="Where you left off, on this device. Play carries on from that song.">
        {jumpList.map((entry, i) => (
          <JumpCard key={`${entry.kind}:${entry.id}`} entry={entry} mixes={mixList} index={i} />
        ))}
      </Shelf>
    ),

    mixes: isAccount && (
      <ShelfState title="Today's mixes" query={mixes} isEmpty={mixList.length === 0}>
        <Shelf title="Today's mixes" detail="Made each day from what you play">
          {mixList.map((mix, i) => (
            <ShelfCard
              key={mix.id}
              index={i}
              to={`/mixes/${mix.id}`}
              picture={<MixCover tracks={mix.tracks} fill />}
              title={`${mix.name} mix`}
              subtitle={mix.tracks
                .slice(0, 3)
                .map((track) => track.artist ?? 'Unknown Artist')
                .filter((artist, j, all) => all.indexOf(artist) === j)
                .join(', ')}
              onPlay={() => startRadio(mix.tracks[0], mix.tracks, { kind: 'mix', id: mix.id })}
              playLabel={`Play the ${mix.name} mix`}
              disabled={inRoom}
            />
          ))}
        </Shelf>
      </ShelfState>
    ),

    recent: isAccount && (
      <ShelfState title="Recently played" query={history} isEmpty={recentAlbums.length === 0}>
        <Shelf title="Recently played" seeAll={user ? { to: `/people/${user.id}?tab=stats`, label: 'History' } : undefined}>
          {recentAlbums.map((album, i) => (
            <ShelfCard
              key={album.albumId}
              index={i}
              to={`/albums/${album.albumId}`}
              picture={<CoverArt kind="albums" id={album.albumId} size="full" className="aspect-square h-auto w-full" />}
              title={album.album}
              subtitle={album.artist ?? 'Unknown Artist'}
              onPlay={() => void playAlbum(album.albumId)}
              disabled={inRoom}
            />
          ))}
        </Shelf>
      </ShelfState>
    ),

    because: isAccount && lastPlayed && (
      <ShelfState title="Because you played" query={because} isEmpty={radio.length === 0}>
        <Shelf
          title={`Because you played ${lastPlayed.title}`}
          detail="Songs like it. Tap one to play from there; more like it follow."
        >
          {radio.slice(0, SHELF_SIZE).map((track, i) => (
            <ShelfCard
              key={track.id}
              index={i}
              onClick={() => startRadio(track, radio.slice(i))}
              disabled={inRoom}
              label={`Play ${track.title}, then more like ${lastPlayed.title}`}
              picture={<CoverArt kind="tracks" id={track.id} size="full" className="aspect-square h-auto w-full" />}
              title={track.title}
              subtitle={track.artist ?? 'Unknown Artist'}
            />
          ))}
        </Shelf>
      </ShelfState>
    ),

    playlists: isAccount && (
      <ShelfState title="Your playlists" query={playlists} isEmpty={mine.length === 0}>
        <Shelf title="Your playlists" seeAll={{ to: '/playlists' }}>
          {mine.slice(0, SHELF_SIZE).map((playlist, i) => (
            <ShelfCard
              key={playlist.id}
              index={i}
              to={`/playlists/${playlist.id}`}
              picture={<PlaylistPicture albumIds={playlist.coverAlbumIds} />}
              title={playlist.name}
              subtitle={playlist.isSmart ? 'Smart playlist' : `${playlist.trackCount} track${playlist.trackCount === 1 ? '' : 's'}`}
              onPlay={playlist.trackCount > 0 || playlist.isSmart ? () => void playPlaylist(playlist.id) : undefined}
              disabled={inRoom}
            />
          ))}
        </Shelf>
      </ShelfState>
    ),

    // Shown only while someone is playing: an empty "nobody's listening" row on most visits would be noise.
    friends: isAccount && listening.length > 0 && (
      <Shelf
        title="Friends listening"
        detail="Playing right now. Tap to play the same song."
        seeAll={user ? { to: `/people/${user.id}?tab=friends`, label: 'Friends' } : undefined}
      >
        {listening.map((l, i) => (
          <li key={l.person.id} className="shelf-card motion-rise flex flex-col" style={{ '--i': i } as React.CSSProperties}>
            <button
              type="button"
              onClick={() => playTrack(l.track)}
              disabled={inRoom}
              aria-label={`Play ${l.track.title}, which ${l.person.name} is playing`}
              className="shelf-card-hit group disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="relative block">
                <CoverArt kind="tracks" id={l.track.id} size="full" className="aspect-square h-auto w-full" />
                <span className="absolute bottom-1.5 left-1.5">
                  <Avatar userId={l.person.id} name={l.person.name} avatarId={l.person.avatarId} size="sm" />
                </span>
              </span>
              <span className="block min-w-0 pt-2">
                <span className="block truncate text-xs text-blue-300">{l.person.name} is playing</span>
                <span className="block truncate text-sm font-medium text-white group-hover:text-orange-400">
                  {l.track.title}
                </span>
                <span className="block truncate text-xs text-blue-300">{l.track.artist ?? 'Unknown Artist'}</span>
              </span>
            </button>
            {/* They're in a Listen together room: join it, like a room link (A255). */}
            {l.roomCode && l.roomCode !== room?.code && (
              <button
                type="button"
                onClick={() => {
                  join(l.roomCode!);
                  navigate('/together');
                }}
                className="btn-secondary btn-sm mx-2 mt-1"
                aria-label={`Join ${l.person.name}'s room${room ? ', leaving yours' : ''}`}
              >
                Join their room
              </button>
            )}
          </li>
        ))}
      </Shelf>
    ),

    'on-this-day': isAccount && (
      <ShelfState title="On this day" query={onThisDay} isEmpty={years.length === 0}>
        <Shelf title="On this day" detail="What you played on this date in other years. Tap to play it.">
          {years.map((year, i) => (
            <ShelfCard
              key={year.year}
              index={i}
              onClick={() => playQueue(year.tracks, 0)}
              disabled={inRoom}
              label={`Play what you played ${year.yearsAgo === 1 ? '1 year' : `${year.yearsAgo} years`} ago`}
              picture={<CoverArt kind="tracks" id={year.tracks[0].id} size="full" className="aspect-square h-auto w-full" />}
              title={year.yearsAgo === 1 ? '1 year ago' : `${year.yearsAgo} years ago`}
              subtitle={`${year.year} · ${year.tracks.length} song${year.tracks.length === 1 ? '' : 's'}`}
            />
          ))}
        </Shelf>
      </ShelfState>
    ),

    new: (
      <ShelfState title="New in your library" query={newAlbums} isEmpty={albums.length === 0}>
        <Shelf title="New in your library" detail="Albums by when their newest song arrived" seeAll={{ to: '/albums' }}>
          {albums.map((album, i) => (
            <ShelfCard
              key={album.id}
              index={i}
              to={`/albums/${album.id}`}
              picture={<CoverArt kind="albums" id={album.id} size="full" className="aspect-square h-auto w-full" alt="" />}
              title={album.title}
              subtitle={album.artistName ?? 'Unknown Artist'}
              onPlay={() => void playAlbum(album.id)}
              disabled={inRoom}
            />
          ))}
        </Shelf>
      </ShelfState>
    ),
  };

  return (
    <div className="flex flex-col gap-10">
      <h1 className="sr-only">Home</h1>

      {layout.order.filter(shows).map((id) => (
        <div key={id} className="contents">
          {shelves[id]}
        </div>
      ))}

      {!isAccount && (
        <ShelfState title="Public playlists" query={publicPlaylists} isEmpty={shared.length === 0}>
          <Shelf title="Public playlists" detail="Made by people on this server" seeAll={{ to: '/playlists' }}>
            {shared.slice(0, SHELF_SIZE).map((playlist, i) => (
              <ShelfCard
                key={playlist.id}
                index={i}
                to={`/playlists/${playlist.id}`}
                picture={<PlaylistPicture albumIds={playlist.coverAlbumIds} />}
                title={playlist.name}
                subtitle={`by ${playlist.ownerName}`}
                onPlay={playlist.trackCount > 0 ? () => void playPlaylist(playlist.id) : undefined}
                disabled={inRoom}
              />
            ))}
          </Shelf>
        </ShelfState>
      )}

      {/* Nothing at all to offer: a new server with no albums yet. Say why and what fills it. */}
      {newAlbums.isSuccess && albums.length === 0 && (
        <p className="text-sm text-blue-300">
          No music here yet. Once the server has scanned a library, new albums, your mixes and your plays show up here.
        </p>
      )}
    </div>
  );
}
