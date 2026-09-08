import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { AlbumGrid } from '../components/AlbumGrid';
import { apiClient } from '../lib/apiClient';
import type { ArtistDetail } from '../types/api';

export function ArtistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const artistId = Number(id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['artist', artistId],
    queryFn: () => apiClient.get<ArtistDetail>(`/artists/${artistId}`),
    enabled: Number.isInteger(artistId),
  });

  if (isLoading) return <p className="text-sm text-blue-300">Loading artist…</p>;
  if (isError || !data) return <p className="text-sm text-red-400">Could not load that artist.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-widest text-blue-400">Artist</span>
        <h1 className="text-2xl font-semibold text-white">{data.name}</h1>
        <p className="text-sm text-blue-200">
          {data.albumCount} album{data.albumCount === 1 ? '' : 's'} · {data.trackCount} track
          {data.trackCount === 1 ? '' : 's'}
        </p>
      </div>

      {/* The artist is already the page's subject — repeating it on every card
          would be noise. */}
      <AlbumGrid albums={data.albums} showArtist={false} />
    </div>
  );
}
