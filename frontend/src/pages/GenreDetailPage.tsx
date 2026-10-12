import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AlbumGrid } from '../components/AlbumGrid';
import { apiClient } from '../lib/apiClient';
import type { GenreDetail } from '../types/api';
import { Skeleton, SkeletonAlbumGrid, SkeletonDetailHeader } from '../components/Skeleton';

/** One genre's albums. An album counts when any of its songs carries the genre. */
export function GenreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const genreId = Number(id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['genre', genreId],
    queryFn: () => apiClient.get<GenreDetail>(`/genres/${genreId}`),
    enabled: Number.isInteger(genreId),
  });

  if (isLoading) {
    return (
      <Skeleton label="Loading genre…">
        <SkeletonDetailHeader />
        <SkeletonAlbumGrid count={10} />
      </Skeleton>
    );
  }
  if (isError || !data) return <p className="text-sm text-red-300">Could not load that genre.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link to="/genres" className="font-mono text-xs uppercase tracking-widest text-blue-400 hover:text-orange-400">
          Genre
        </Link>
        <h1 className="text-2xl font-semibold text-white">{data.name}</h1>
        <p className="text-sm text-blue-200">
          {data.albumCount} album{data.albumCount === 1 ? '' : 's'} · {data.trackCount} track
          {data.trackCount === 1 ? '' : 's'}
        </p>
      </div>
      <AlbumGrid albums={data.albums} />
    </div>
  );
}
