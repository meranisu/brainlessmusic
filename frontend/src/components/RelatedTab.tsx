import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../lib/apiClient";
import { formatClock } from "../lib/format";
import type { AlbumDetail, ArtistDetail } from "../types/api";
import { CoverArt } from "./CoverArt";
import type { PlayerContextValue, QueueTrack } from "./PlayerBar";

/**
 * More from the playing song's album, then the artist's other albums. Shared by the desktop view and the phone sheet.
 * The queries use the album and artist pages' keys, so a visit to either is already cached.
 */
export function RelatedTab({
  current,
  playQueue,
}: {
  current: QueueTrack;
  playQueue: PlayerContextValue["playQueue"];
}) {
  const albumId = current.albumId ?? null;
  const { data: album } = useQuery({
    queryKey: ["album", albumId],
    queryFn: () => apiClient.get<AlbumDetail>(`/albums/${albumId}`),
    enabled: albumId !== null,
    staleTime: 60_000,
  });
  const artistId = album?.artistId ?? null;
  const { data: artist } = useQuery({
    queryKey: ["artist", artistId],
    queryFn: () => apiClient.get<ArtistDetail>(`/artists/${artistId}`),
    enabled: artistId !== null,
    staleTime: 60_000,
  });

  /** The album's songs as a queue, the way the album page builds it, so joins inside it stay gapless. */
  const albumQueue: QueueTrack[] =
    album?.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artistName ?? album.artistName,
      duration: t.duration,
      gainDb: t.gainDb,
      format: t.format,
      albumId: album.id,
      trackNumber: t.trackNumber,
    })) ?? [];
  const moreFromAlbum = albumQueue.filter((t) => t.id !== current.id);
  const otherAlbums = (artist?.albums ?? []).filter((a) => a.id !== albumId);

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div>
        <h3 className="font-display px-1 pb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-white">
          More from this album
        </h3>
        {albumId === null ? (
          <p className="px-1 text-sm text-blue-300">
            This song has no album information.
          </p>
        ) : !album ? (
          <p className="px-1 text-sm text-blue-300">Loading the album…</p>
        ) : moreFromAlbum.length === 0 ? (
          <p className="px-1 text-sm text-blue-300">
            It is the only song on its album.
          </p>
        ) : (
          <ul>
            {moreFromAlbum.map((t, i) => (
              <li
                key={t.id}
                className="motion-rise"
                style={{ "--i": i } as CSSProperties}
              >
                <button
                  onClick={() =>
                    playQueue(
                      albumQueue,
                      albumQueue.findIndex((a) => a.id === t.id),
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-blue-900/70"
                >
                  <span className="w-5 shrink-0 text-center font-mono text-xs tabular-nums text-blue-400">
                    {t.trackNumber ?? ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                    {t.title}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-blue-400">
                    {t.duration ? formatClock(t.duration) : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="font-display px-1 pb-2 text-sm font-extrabold uppercase tracking-[0.14em] text-white">
          {album?.artistName
            ? `More by ${album.artistName}`
            : "More by this artist"}
        </h3>
        {artistId === null ? (
          <p className="px-1 text-sm text-blue-300">
            The artist is not known for this song.
          </p>
        ) : !artist ? (
          <p className="px-1 text-sm text-blue-300">Loading the artist…</p>
        ) : otherAlbums.length === 0 ? (
          <p className="px-1 text-sm text-blue-300">No other albums by them.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {otherAlbums.slice(0, 9).map((a, i) => (
              <li
                key={a.id}
                className="motion-rise"
                style={{ "--i": i } as CSSProperties}
              >
                <Link
                  to={`/albums/${a.id}`}
                  className="group flex flex-col gap-1.5 rounded-lg p-1.5 transition-[transform,background-color] duration-200 ease-[var(--ease-spring)] hover:-translate-y-0.5 hover:bg-blue-900/70"
                >
                  <CoverArt
                    kind="albums"
                    id={a.id}
                    className="aspect-square h-auto w-full"
                    alt={`${a.title} cover`}
                  />
                  <span className="truncate text-xs font-medium text-white group-hover:text-orange-400">
                    {a.title}
                  </span>
                  <span className="text-xs text-blue-400">{a.year ?? ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
