import { Link } from 'react-router-dom';
import type { AlbumSummary } from '../types/api';
import { CoverArt } from './CoverArt';

/**
 * Shared by the albums index and an artist's page, so an album reads the same
 * wherever you meet it.
 */
export function AlbumGrid({ albums, showArtist = true }: { albums: AlbumSummary[]; showArtist?: boolean }) {
  if (albums.length === 0) {
    return <p className="text-sm text-blue-300">No albums yet.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {albums.map((album) => (
        <li key={album.id}>
          <Link
            to={`/albums/${album.id}`}
            className="group flex flex-col gap-2 rounded-lg p-2 transition-colors hover:bg-blue-900"
          >
            <CoverArt
              kind="albums"
              id={album.id}
              className="aspect-square h-auto w-full"
              alt={`${album.title} cover`}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white group-hover:text-orange-400">
                {album.title}
              </div>
              {showArtist && (
                <div className="truncate text-xs text-blue-300">{album.artistName ?? 'Unknown Artist'}</div>
              )}
              <div className="text-xs text-blue-400">
                {album.year ? `${album.year} · ` : ''}
                {album.trackCount} track{album.trackCount === 1 ? '' : 's'}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
