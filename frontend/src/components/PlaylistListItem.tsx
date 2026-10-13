import { Link } from 'react-router-dom';
import { CoverArt } from './CoverArt';

/**
 * One playlist in a list: cover from its first album, name, and who made it when it isn't yours (A162). The whole row
 * opens the playlist through a stretched link; the maker's name sits above it and opens their profile (A172), since
 * one link can't hold another.
 */
export function PlaylistListItem({
  id,
  name,
  trackCount,
  coverAlbumIds,
  ownerId,
  ownerName,
  isPublic,
}: {
  id: number;
  name: string;
  trackCount: number;
  coverAlbumIds: number[];
  /** With `ownerName`, makes the name a link to their profile. */
  ownerId?: number;
  /** Set for someone else's playlist. */
  ownerName?: string;
  /** Marks your own public playlist. */
  isPublic?: boolean;
}) {
  return (
    <div className="relative flex items-center gap-3 px-4 py-3 transition-colors focus-within:bg-blue-800/40 hover:bg-blue-800/40">
      {coverAlbumIds.length > 0 ? (
        <CoverArt kind="albums" id={coverAlbumIds[0]} className="h-10 w-10" />
      ) : (
        <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-blue-700 bg-blue-950" />
      )}
      <span className="min-w-0 flex-1">
        <Link
          to={`/playlists/${id}`}
          className="block truncate font-medium text-white outline-none after:absolute after:inset-0"
        >
          {name}
        </Link>
        <span className="block truncate text-xs text-blue-300">
          {ownerName ? (
            <>
              by{' '}
              {ownerId !== undefined ? (
                <Link
                  to={`/people/${ownerId}`}
                  className="relative z-10 underline-offset-2 hover:text-white hover:underline"
                >
                  {ownerName}
                </Link>
              ) : (
                ownerName
              )}
            </>
          ) : isPublic ? (
            'Public'
          ) : (
            'Only you'
          )}
        </span>
      </span>
      <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">
        {trackCount} track{trackCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}
