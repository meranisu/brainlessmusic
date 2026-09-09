import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { AlbumGrid } from '../components/AlbumGrid';
import { CoverArt } from '../components/CoverArt';
import { FavoriteButton, useFavoriteIds } from '../components/FavoriteButton';
import { usePlayer, type QueueTrack } from '../components/PlayerBar';
import { apiClient } from '../lib/apiClient';
import type { SearchResults } from '../types/api';

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold text-white">
        {title}
        <span className="font-mono text-xs font-normal tabular-nums text-blue-400">{count}</span>
      </h2>
      {children}
    </section>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const { playQueue } = usePlayer();
  const favoriteIds = useFavoriteIds();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['search', query],
    queryFn: () => apiClient.get<SearchResults>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
  });

  const queue: QueueTrack[] = (data?.tracks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
  }));

  const total = data ? data.artists.length + data.albums.length + data.tracks.length : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">
          {query ? <>Results for “{query}”</> : 'Search'}
        </h1>
        <p className="text-sm text-blue-300">
          {!query
            ? 'Type in the box above, or press / from anywhere.'
            : isLoading
              ? 'Searching…'
              : `${total} result${total === 1 ? '' : 's'} across artists, albums and tracks`}
        </p>
      </div>

      {isError && <p className="text-sm text-red-400">Search failed.</p>}

      {data && total === 0 && (
        <p className="text-sm text-blue-300">
          Nothing matched “{query}”. Search looks inside titles, so partial words are fine.
        </p>
      )}

      {data && (
        <>
          <Section title="Artists" count={data.artists.length}>
            <ul className="card divide-y divide-blue-800/60 overflow-hidden">
              {data.artists.map((artist) => (
                <li key={artist.id}>
                  <Link
                    to={`/artists/${artist.id}`}
                    className="flex items-baseline gap-3 px-4 py-3 transition-colors hover:bg-blue-800/40"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium text-white">{artist.name}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">
                      {artist.albumCount} album{artist.albumCount === 1 ? '' : 's'} ·{' '}
                      {artist.trackCount} track{artist.trackCount === 1 ? '' : 's'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Albums" count={data.albums.length}>
            <AlbumGrid albums={data.albums} />
          </Section>

          <Section title="Tracks" count={data.tracks.length}>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-blue-800/60">
                  {data.tracks.map((track, i) => (
                    <tr
                      key={track.id}
                      onClick={() => playQueue(queue, i)}
                      className="cursor-pointer transition-colors hover:bg-blue-800/40"
                    >
                      <td className="py-2.5 pl-4 pr-3 font-medium text-white">
                        <div className="flex items-center gap-2.5">
                          <CoverArt kind="tracks" id={track.id} className="h-9 w-9" />
                          <span className="truncate">{track.title}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-blue-200">{track.artist ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-blue-200">{track.album ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-blue-200">
                        {formatDuration(track.duration)}
                      </td>
                      <td className="w-10 py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                        <FavoriteButton trackId={track.id} isFavorited={favoriteIds.has(track.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
