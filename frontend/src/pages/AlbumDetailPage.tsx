import { useQuery } from '@tanstack/react-query';
import { formatDuration } from '../lib/format';
import { Link, useParams } from 'react-router-dom';
import { CoverArt } from '../components/CoverArt';
import { FavoriteButton, useFavoriteIds } from '../components/FavoriteButton';
import { usePlayer, type QueueTrack } from '../components/PlayerBar';
import { apiClient } from '../lib/apiClient';
import type { AlbumDetail } from '../types/api';
import { PlayIcon } from '../components/icons';

export function AlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const albumId = Number(id);
  const { playQueue } = usePlayer();
  const favoriteIds = useFavoriteIds();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['album', albumId],
    queryFn: () => apiClient.get<AlbumDetail>(`/albums/${albumId}`),
    enabled: Number.isInteger(albumId),
  });

  // Album tracks carry no artist of their own — it belongs to the album, so
  // the player gets it from there.
  const queue: QueueTrack[] =
    data?.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: data.artistName,
      duration: t.duration,
      format: t.format,
    })) ?? [];

  if (isLoading) return <p className="text-sm text-blue-300">Loading album…</p>;
  if (isError || !data) return <p className="text-sm text-red-400">Could not load that album.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <CoverArt
          kind="albums"
          id={data.id}
          size="full"
          className="h-40 w-40"
          alt={`${data.title} cover`}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-widest text-blue-400">Album</span>
          <h1 className="text-2xl font-semibold text-white">{data.title}</h1>
          <p className="text-sm text-blue-200">
            {data.artistId ? (
              <Link to={`/artists/${data.artistId}`} className="hover:text-orange-400">
                {data.artistName ?? 'Unknown Artist'}
              </Link>
            ) : (
              (data.artistName ?? 'Unknown Artist')
            )}
            {data.year ? ` · ${data.year}` : ''} · {data.tracks.length} track
            {data.tracks.length === 1 ? '' : 's'}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => playQueue(queue, 0)}
              disabled={queue.length === 0}
              className="btn-primary btn-md"
            >
              <PlayIcon className="h-3.5 w-3.5" /> Play album
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-blue-800 text-left font-mono text-xs uppercase tracking-wider text-blue-400">
            <tr>
              <th className="w-12 py-2.5 pl-4">#</th>
              <th className="py-2.5 pr-3">Title</th>
              <th className="py-2.5 pr-4 text-right">Duration</th>
              <th className="w-32 py-2.5 pr-4">Format</th>
              <th className="w-10 py-2.5 pr-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-800/60">
            {data.tracks.map((track, i) => (
              <tr
                key={track.id}
                onClick={() => playQueue(queue, i)}
                className="group cursor-pointer transition-colors hover:bg-blue-800/40"
              >
                <td className="py-2.5 pl-4 tabular-nums text-blue-400">
                  <span className="group-hover:hidden">{track.trackNumber ?? i + 1}</span>
                  <PlayIcon className="hidden h-3 w-3 text-orange-500 group-hover:inline" />
                </td>
                <td className="py-2.5 pr-3 font-medium text-white">{track.title}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-blue-200">
                  {formatDuration(track.duration)}
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-blue-300">{track.format ?? '—'}</td>
                <td className="py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                  <FavoriteButton trackId={track.id} isFavorited={favoriteIds.has(track.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.tracks.length === 0 && (
          <p className="px-4 py-6 text-sm text-blue-300">This album has no tracks.</p>
        )}
      </div>
    </div>
  );
}
