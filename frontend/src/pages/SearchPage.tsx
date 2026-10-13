import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { CoverArt } from '../components/CoverArt';
import { FavoriteButton, useFavoriteIds } from '../components/FavoriteButton';
import { PlaylistListItem } from '../components/PlaylistListItem';
import { usePlayer, type QueueTrack } from '../components/PlayerBar';
import { useToast } from '../components/ToastProvider';
import { PlayIcon } from '../components/icons';
import { apiClient } from '../lib/apiClient';
import { clearRecentSearches, forgetSearch, readRecentSearches, rememberSearch } from '../lib/recentSearches';
import { highlightRuns } from '../lib/searchText';
import type {
  AlbumDetail,
  AlbumSummary,
  ArtistSummary,
  GenreListResponse,
  Person,
  PlaylistSearchResult,
  SearchKind,
  SearchKindPage,
  SearchResults,
  TrackSummary,
} from '../types/api';
import { Skeleton, SkeletonListRows, SkeletonTrackRows } from '../components/Skeleton';

const KINDS: { id: SearchKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tracks', label: 'Songs' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'people', label: 'People' },
];

/** How many of each kind the All view shows before "See all". */
const SONGS_SHOWN = 5;
const OTHERS_SHOWN = 4;
const PAGE = 30;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const songs = (n: number) => `${n} song${n === 1 ? '' : 's'}`;

function toQueue(tracks: TrackSummary[]): QueueTrack[] {
  return tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, gainDb: t.gainDb, format: t.format }));
}

/** `text` with the words of the search picked out, ignoring case and accents. */
function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightRuns(text, query).map((run, i) =>
        run.match ? (
          <mark key={i} className="bg-transparent font-semibold text-accent-ink">
            {run.text}
          </mark>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}

/** Plays an album from its first song: the album rows' play button and an album top result. */
function usePlayAlbum() {
  const { playQueue } = usePlayer();
  const { showToast } = useToast();
  return async (albumId: number) => {
    try {
      const album = await apiClient.get<AlbumDetail>(`/albums/${albumId}`);
      if (album.tracks.length === 0) return showToast('That album has no songs to play.', 'error');
      playQueue(
        album.tracks.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artistName ?? album.artistName,
          duration: t.duration,
          gainDb: t.gainDb,
          format: t.format,
          albumId: album.id,
          trackNumber: t.trackNumber,
        })),
        0,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not play that album', 'error');
    }
  };
}

/**
 * Search (Q187): kind tabs; before searching, recent searches and genres; on All, a top result and a few of each kind
 * with "See all"; on one kind, its whole list with Load more. Nothing found offers the nearest name and what to try.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const rawKind = params.get('kind');
  const kind: SearchKind | 'all' = KINDS.some((k) => k.id === rawKind) ? (rawKind as SearchKind) : 'all';
  const { user } = useAuth();
  const [recent, setRecent] = useState(() => readRecentSearches(user?.id));

  // A search arrives as a URL (the header box submits there), so each new one is a search made on purpose: keep it.
  // Followed during render, as GlobalSearch follows the URL, rather than set from an effect.
  const [lastQuery, setLastQuery] = useState('');
  if (query && query !== lastQuery) {
    setLastQuery(query);
    setRecent(rememberSearch(user?.id, query));
  }

  const setKind = (next: SearchKind | 'all') =>
    setParams(next === 'all' ? { q: query } : { q: query, kind: next });

  if (!query) {
    return (
      <BeforeSearching
        recent={recent}
        onForget={(q) => setRecent(forgetSearch(user?.id, q))}
        onClear={() => setRecent(clearRecentSearches(user?.id))}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold text-white">Results for “{query}”</h1>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                kind === k.id
                  ? 'border-orange-600 bg-blue-800 text-white'
                  : 'border-blue-700 text-blue-300 hover:border-blue-500 hover:text-white'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {kind === 'all' ? <AllResults query={query} onSeeAll={setKind} /> : <OneKind query={query} kind={kind} onAll={() => setKind('all')} />}
    </div>
  );
}

// ---- Before searching ---------------------------------------------------------------------------------------------

function BeforeSearching({ recent, onForget, onClear }: { recent: string[]; onForget: (q: string) => void; onClear: () => void }) {
  const genres = useQuery({
    queryKey: ['genres'],
    queryFn: () => apiClient.get<GenreListResponse>('/genres'),
  });
  const topGenres = [...(genres.data?.genres ?? [])].sort((a, b) => b.trackCount - a.trackCount).slice(0, 16);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Search</h1>
        <p className="text-sm text-blue-300">
          Songs, artists, albums, playlists and people. Type in the box above, or press <kbd className="font-mono">/</kbd> from
          anywhere.
        </p>
      </div>

      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Recent searches</h2>
            <button type="button" onClick={onClear} className="btn-ghost btn-sm">
              Clear all
            </button>
          </div>
          <ul className="card divide-y divide-blue-800/60 overflow-hidden">
            {recent.map((q) => (
              <li key={q} className="flex items-center">
                <Link
                  to={`/search?q=${encodeURIComponent(q)}`}
                  className="min-w-0 flex-1 truncate px-4 py-2.5 text-sm text-white transition-colors hover:bg-blue-800/40"
                >
                  {q}
                </Link>
                <button
                  type="button"
                  onClick={() => onForget(q)}
                  aria-label={`Remove “${q}” from recent searches`}
                  className="tap-target px-3 text-blue-400 transition-colors hover:text-white"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {topGenres.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-white">Browse by genre</h2>
          <ul className="flex flex-wrap gap-2">
            {topGenres.map((g) => (
              <li key={g.id}>
                <Link
                  to={`/genres/${g.id}`}
                  className="inline-flex items-baseline gap-2 rounded-md border border-blue-700 px-3 py-1.5 text-sm text-white transition-colors hover:border-orange-600"
                >
                  {g.name}
                  <span className="font-mono text-xs tabular-nums text-blue-400">{g.trackCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---- Nothing found ------------------------------------------------------------------------------------------------

function NothingFound({ query, suggestion, kind, onAll }: { query: string; suggestion?: string | null; kind: SearchKind | 'all'; onAll: () => void }) {
  const what = kind === 'all' ? 'anything' : KINDS.find((k) => k.id === kind)!.label.toLowerCase();
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-white">
        No {what} for “{query}”
      </h2>
      {suggestion && (
        <p className="text-sm text-blue-200">
          Did you mean{' '}
          <Link to={`/search?q=${encodeURIComponent(suggestion)}`} className="font-semibold text-accent-ink underline-offset-2 hover:underline">
            {suggestion}
          </Link>
          ?
        </p>
      )}
      <p className="max-w-md text-sm text-blue-300">
        Check the spelling, try fewer words, or search by the artist or album instead. Search looks inside names, so part
        of a word is enough.
      </p>
      {kind !== 'all' && (
        <button type="button" onClick={onAll} className="btn-secondary btn-sm">
          Search everything
        </button>
      )}
    </div>
  );
}

// ---- All kinds ----------------------------------------------------------------------------------------------------

function Section({ title, more, onSeeAll, children }: { title: string; more: boolean; onSeeAll: () => void; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {more && (
          <button type="button" onClick={onSeeAll} className="btn-ghost btn-sm">
            See all
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function AllResults({ query, onSeeAll }: { query: string; onSeeAll: (kind: SearchKind) => void }) {
  const { data, isLoading, isError, isPlaceholderData } = useQuery({
    queryKey: ['search', query],
    queryFn: () => apiClient.get<SearchResults>(`/search?q=${encodeURIComponent(query)}`),
    // The last results stay up, dimmed, while a new search loads (A83).
    placeholderData: (prev) => prev,
  });

  if (isLoading) {
    return (
      <Skeleton label={`Searching for “${query}”…`}>
        <SkeletonListRows rows={2} />
        <SkeletonTrackRows rows={5} cover />
      </Skeleton>
    );
  }
  if (isError || !data) return <p className="text-sm text-red-300">Search failed. Reload to try again.</p>;

  const total = data.artists.length + data.albums.length + data.tracks.length + data.playlists.length + data.people.length;
  if (total === 0 && !isPlaceholderData) return <NothingFound query={query} suggestion={data.suggestion} kind="all" onAll={() => {}} />;

  const more = (kind: SearchKind, shown: number, list: unknown[]) => Boolean(data.hasMore?.[kind]) || list.length > shown;

  return (
    <div className={`flex flex-col gap-8 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
      {data.top && <TopResult top={data.top} results={data} query={query} />}
      {data.tracks.length > 0 && (
        <Section title="Songs" more={more('tracks', SONGS_SHOWN, data.tracks)} onSeeAll={() => onSeeAll('tracks')}>
          <TrackTable tracks={data.tracks.slice(0, SONGS_SHOWN)} query={query} />
        </Section>
      )}
      {data.artists.length > 0 && (
        <Section title="Artists" more={more('artists', OTHERS_SHOWN, data.artists)} onSeeAll={() => onSeeAll('artists')}>
          <ArtistList artists={data.artists.slice(0, OTHERS_SHOWN)} query={query} />
        </Section>
      )}
      {data.albums.length > 0 && (
        <Section title="Albums" more={more('albums', OTHERS_SHOWN, data.albums)} onSeeAll={() => onSeeAll('albums')}>
          <AlbumList albums={data.albums.slice(0, OTHERS_SHOWN)} query={query} />
        </Section>
      )}
      {/* Yours, then other people's public ones (A162). */}
      {data.playlists.length > 0 && (
        <Section title="Playlists" more={more('playlists', OTHERS_SHOWN, data.playlists)} onSeeAll={() => onSeeAll('playlists')}>
          <PlaylistList playlists={data.playlists.slice(0, OTHERS_SHOWN)} />
        </Section>
      )}
      {data.people.length > 0 && (
        <Section title="People" more={more('people', OTHERS_SHOWN, data.people)} onSeeAll={() => onSeeAll('people')}>
          <PeopleList people={data.people.slice(0, OTHERS_SHOWN)} query={query} />
        </Section>
      )}
    </div>
  );
}

/** The best match, big: Play for a song or album, Open for an artist. */
function TopResult({ top, results, query }: { top: NonNullable<SearchResults['top']>; results: SearchResults; query: string }) {
  const { playQueue } = usePlayer();
  const playAlbum = usePlayAlbum();
  let title: string;
  let label: string;
  let art: ReactNode;
  let action: ReactNode;
  if (top.kind === 'track') {
    const i = results.tracks.findIndex((t) => t.id === top.id);
    if (i < 0) return null;
    const t = results.tracks[i];
    title = t.title;
    label = ['Song', t.artist].filter(Boolean).join(' · ');
    art = <CoverArt kind="tracks" id={t.id} className="h-24 w-24" />;
    action = (
      <button type="button" onClick={() => playQueue(toQueue(results.tracks), i)} className="btn-primary btn-md">
        <PlayIcon className="h-3.5 w-3.5" /> Play
      </button>
    );
  } else if (top.kind === 'album') {
    const a = results.albums.find((x) => x.id === top.id);
    if (!a) return null;
    title = a.title;
    label = ['Album', a.artistName, a.year].filter(Boolean).join(' · ');
    art = <CoverArt kind="albums" id={a.id} className="h-24 w-24" />;
    action = (
      <span className="flex gap-2">
        <button type="button" onClick={() => void playAlbum(a.id)} className="btn-primary btn-md">
          <PlayIcon className="h-3.5 w-3.5" /> Play
        </button>
        <Link to={`/albums/${a.id}`} className="btn-secondary btn-md">
          Open album
        </Link>
      </span>
    );
  } else {
    const a = results.artists.find((x) => x.id === top.id);
    if (!a) return null;
    title = a.name;
    label = `Artist · ${songs(a.trackCount)}`;
    art = (
      <span aria-hidden="true" className="grid h-24 w-24 shrink-0 place-items-center rounded-md bg-blue-800 font-display text-4xl font-extrabold text-white">
        {[...a.name.trim()][0]?.toUpperCase() ?? '?'}
      </span>
    );
    action = (
      <Link to={`/artists/${a.id}`} className="btn-secondary btn-md">
        Open artist
      </Link>
    );
  }
  return (
    <section aria-label="Top result" className="card flex items-center gap-4 p-4">
      {art}
      <div className="min-w-0 flex-1">
        <span className="font-mono text-xs uppercase tracking-widest text-accent-ink">Top result</span>
        <p className="truncate font-display text-2xl font-extrabold text-white">
          <Highlight text={title} query={query} />
        </p>
        <p className="truncate text-xs text-blue-300">{label}</p>
        <div className="mt-3">{action}</div>
      </div>
    </section>
  );
}

// ---- One kind -----------------------------------------------------------------------------------------------------

function OneKind({ query, kind, onAll }: { query: string; kind: SearchKind; onAll: () => void }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: ['search', query, kind],
    queryFn: ({ pageParam }) =>
      apiClient.get<SearchKindPage<unknown>>(
        `/search?q=${encodeURIComponent(query)}&type=${kind}&offset=${pageParam}&limit=${PAGE}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
  });

  if (isLoading) {
    return (
      <Skeleton label={`Searching for “${query}”…`}>
        <SkeletonTrackRows rows={8} cover />
      </Skeleton>
    );
  }
  if (isError || !data) return <p className="text-sm text-red-300">Search failed. Reload to try again.</p>;

  const items = data.pages.flatMap((p) => p.items);
  if (items.length === 0) return <NothingFound query={query} kind={kind} onAll={onAll} />;

  return (
    <div className="flex flex-col gap-4">
      {kind === 'tracks' && <TrackTable tracks={items as TrackSummary[]} query={query} />}
      {kind === 'artists' && <ArtistList artists={items as ArtistSummary[]} query={query} />}
      {kind === 'albums' && <AlbumList albums={items as AlbumSummary[]} query={query} />}
      {kind === 'playlists' && <PlaylistList playlists={items as PlaylistSearchResult[]} />}
      {kind === 'people' && <PeopleList people={items as Person[]} query={query} />}
      {hasNextPage ? (
        <button type="button" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} className="btn-secondary btn-md self-center">
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : (
        <p className="text-center text-xs text-blue-400">That's everything for “{query}”.</p>
      )}
    </div>
  );
}

// ---- Lists --------------------------------------------------------------------------------------------------------

function TrackTable({ tracks, query }: { tracks: TrackSummary[]; query: string }) {
  const { playQueue } = usePlayer();
  const favoriteIds = useFavoriteIds();
  const queue = toQueue(tracks);
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-blue-800/60">
          {tracks.map((track, i) => (
            <tr key={track.id} onClick={() => playQueue(queue, i)} className="cursor-pointer transition-colors hover:bg-blue-800/40">
              <td className="py-2.5 pl-4 pr-3 font-medium text-white">
                <div className="flex items-center gap-2.5">
                  <CoverArt kind="tracks" id={track.id} className="h-9 w-9" />
                  <span className="truncate">
                    <Highlight text={track.title} query={query} />
                  </span>
                </div>
              </td>
              <td className="hidden py-2.5 pr-3 text-blue-200 sm:table-cell">
                <Highlight text={track.artist ?? '—'} query={query} />
              </td>
              <td className="hidden py-2.5 pr-3 text-blue-200 md:table-cell">
                <Highlight text={track.album ?? '—'} query={query} />
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-blue-200">{formatDuration(track.duration)}</td>
              <td className="w-10 py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                <FavoriteButton trackId={track.id} isFavorited={favoriteIds.has(track.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArtistList({ artists, query }: { artists: ArtistSummary[]; query: string }) {
  return (
    <ul className="card divide-y divide-blue-800/60 overflow-hidden">
      {artists.map((artist) => (
        <li key={artist.id}>
          <Link to={`/artists/${artist.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-blue-800/40">
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-blue-800 font-display font-extrabold text-white">
              {[...artist.name.trim()][0]?.toUpperCase() ?? '?'}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-white">
              <Highlight text={artist.name} query={query} />
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">
              {songs(artist.trackCount)} · {artist.albumCount} album{artist.albumCount === 1 ? '' : 's'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AlbumList({ albums, query }: { albums: AlbumSummary[]; query: string }) {
  const playAlbum = usePlayAlbum();
  return (
    <ul className="card divide-y divide-blue-800/60 overflow-hidden">
      {albums.map((album) => (
        <li key={album.id} className="relative flex items-center gap-3 px-4 py-2.5 transition-colors focus-within:bg-blue-800/40 hover:bg-blue-800/40">
          <CoverArt kind="albums" id={album.id} className="h-10 w-10" />
          <span className="min-w-0 flex-1">
            <Link to={`/albums/${album.id}`} className="block truncate font-medium text-white outline-none after:absolute after:inset-0">
              <Highlight text={album.title} query={query} />
            </Link>
            <span className="block truncate text-xs text-blue-300">
              <Highlight text={[album.artistName ?? 'Unknown artist', album.year].filter(Boolean).join(' · ')} query={query} />
            </span>
          </span>
          <button
            type="button"
            onClick={() => void playAlbum(album.id)}
            aria-label={`Play ${album.title}`}
            className="tap-target relative z-10 text-blue-300 transition-colors hover:text-white"
          >
            <PlayIcon className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function PlaylistList({ playlists }: { playlists: PlaylistSearchResult[] }) {
  return (
    <ul className="card divide-y divide-blue-800/60 overflow-hidden">
      {playlists.map((p) => (
        <li key={p.id}>
          <PlaylistListItem
            id={p.id}
            name={p.name}
            trackCount={p.trackCount}
            coverAlbumIds={p.coverAlbumIds}
            ownerId={p.ownerId}
            ownerName={p.isOwner ? undefined : p.ownerName}
            isPublic={p.isPublic}
          />
        </li>
      ))}
    </ul>
  );
}

function PeopleList({ people, query }: { people: Person[]; query: string }) {
  return (
    <ul className="card divide-y divide-blue-800/60 overflow-hidden">
      {people.map((p) => (
        <li key={p.id}>
          <Link to={`/people/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-blue-800/40">
            <Avatar userId={p.id} name={p.name} avatarId={p.avatarId} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-white">
                <Highlight text={p.name} query={query} />
              </span>
              {p.bio && <span className="block truncate text-xs text-blue-300">{p.bio}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
