import { Link } from 'react-router-dom';
import type { AlbumSummary } from '../types/api';
import { usePlayCollection } from '../hooks/usePlayCollection';
import { CoverArt } from './CoverArt';
import { PlayIcon } from './icons';

/** Shared by the albums index and artist pages. */
export function AlbumGrid({ albums, showArtist = true }: { albums: AlbumSummary[]; showArtist?: boolean }) {
  const { playAlbum } = usePlayCollection();
  if (albums.length === 0) {
    return <p className="text-sm text-blue-300">No albums yet.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {albums.map((album, i) => (
        <li key={album.id} className="motion-rise" style={{ '--i': i } as React.CSSProperties}>
          {/* The link is stretched over the card, so the play key can sit above it (a button can't go in a link). */}
          <div className="album-card group relative flex flex-col gap-2 rounded-lg p-2 transition-[transform,background-color] duration-200 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-blue-900 has-[a:active]:scale-[0.98]">
            <span className="relative block">
              <CoverArt
                kind="albums"
                id={album.id}
                className="aspect-square h-auto w-full"
                alt={`${album.title} cover`}
              />
              <button
                type="button"
                onClick={() => void playAlbum(album.id)}
                aria-label={`Play ${album.title}`}
                className="shelf-play"
              >
                <PlayIcon className="h-4 w-4" />
              </button>
            </span>
            <div className="min-w-0">
              <Link
                to={`/albums/${album.id}`}
                className="shelf-card-target block truncate text-sm font-medium text-white group-hover:text-orange-400"
              >
                {album.title}
              </Link>
              {showArtist && (
                <div className="truncate text-xs text-blue-300">{album.artistName ?? 'Unknown Artist'}</div>
              )}
              <div className="text-xs text-blue-400">
                {album.year ? `${album.year} · ` : ''}
                {album.trackCount} track{album.trackCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
