import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { AlbumGrid } from '../components/AlbumGrid';
import { apiClient } from '../lib/apiClient';
import type { ArtistDetail } from '../types/api';
import { Skeleton, SkeletonAlbumGrid, SkeletonDetailHeader } from '../components/Skeleton';
import { usePageTitle } from '../hooks/usePageTitle';

export function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const artistId = Number(id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['artist', artistId],
    queryFn: () => apiClient.get<ArtistDetail>(`/artists/${artistId}`),
    enabled: Number.isInteger(artistId),
  });
  usePageTitle(data?.name);

  if (isLoading) {
    return (
      <Skeleton label="Loading artist…">
        <SkeletonDetailHeader />
        <SkeletonAlbumGrid count={5} showArtist={false} />
      </Skeleton>
    );
  }
  if (isError || !data) return <p className="text-sm text-red-300">Could not load that artist.</p>;

  const appearsOn = data.appearsOn ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-blue-400">Artist</span>
        <h1 className="text-2xl font-semibold text-white">{data.name}</h1>
        <p className="text-sm text-blue-200">
          {/* "0 albums" reads wrong for someone who is only featured; their albums are under Appears on. */}
          {data.albumCount > 0 && `${data.albumCount} album${data.albumCount === 1 ? '' : 's'} · `}
          {data.trackCount} track{data.trackCount === 1 ? '' : 's'}
        </p>
      </div>

      {/* The artist is the page's subject, so cards don't repeat it. A featured-only artist has none of their own. */}
      {(data.albums.length > 0 || appearsOn.length === 0) && <AlbumGrid albums={data.albums} showArtist={false} />}

      {/* Their songs on other artists' albums (A149); here the album artist is worth showing. */}
      {appearsOn.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="appears-on">
          <h2 id="appears-on" className="font-mono text-xs uppercase tracking-widest text-blue-400">
            Appears on
          </h2>
          <AlbumGrid albums={appearsOn} />
        </section>
      )}
    </div>
  );
}
