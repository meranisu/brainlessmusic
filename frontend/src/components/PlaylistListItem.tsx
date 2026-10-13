import { Link } from 'react-router-dom';
import { CoverArt } from './CoverArt';

/** One playlist in a list: cover from its first album, name, and who made it when it isn't yours (A162). */
export function PlaylistListItem({
  id,
  name,
  trackCount,
  coverAlbumIds,
  ownerName,
  isPublic,
}: {
  id: number;
  name: string;
  trackCount: number;
  coverAlbumIds: number[];
  /** Set for someone else's playlist. */
  ownerName?: string;
  /** Marks your own public playlist. */
  isPublic?: boolean;
}) {
  return (
    <Link
      to={`/playlists/${id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-blue-800/40 focus-visible:bg-blue-800/40"
    >
      {coverAlbumIds.length > 0 ? (
        <CoverArt kind="albums" id={coverAlbumIds[0]} className="h-10 w-10" />
      ) : (
        <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-blue-700 bg-blue-950" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-white">{name}</span>
        <span className="block truncate text-xs text-blue-300">
          {ownerName ? `by ${ownerName}` : isPublic ? 'Public' : 'Only you'}
        </span>
      </span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">
        {trackCount} track{trackCount === 1 ? '' : 's'}
      </span>
    </Link>
  );
}
