import { useQueryClient } from '@tanstack/react-query';
import { usePlayer, type QueueTrack } from '../components/PlayerBar';
import { useToast } from '../components/ToastProvider';
import { apiClient } from '../lib/apiClient';
import type { AlbumDetail, PlaylistDetail } from '../types/api';

/** The album's songs as its page queues them, so a card's Play and the page's Play are the same queue. */
export function albumQueue(album: AlbumDetail): QueueTrack[] {
  return album.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artistName ?? album.artistName,
    duration: t.duration,
    gainDb: t.gainDb,
    format: t.format,
    // Lets the player keep joins inside the album gapless (A72).
    albumId: album.id,
    trackNumber: t.trackNumber,
  }));
}

export function playlistQueue(playlist: PlaylistDetail): QueueTrack[] {
  return playlist.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    gainDb: t.gainDb,
    format: t.format,
    albumId: t.albumId,
    trackNumber: t.trackNumber,
  }));
}

/**
 * Plays an album or playlist from a card without opening it (A281). The detail goes through the page's own query key,
 * so opening it afterwards costs nothing. `fromTrackId` starts at that song, for Jump back in.
 */
export function usePlayCollection() {
  const queryClient = useQueryClient();
  const { playQueue } = usePlayer();
  const { showToast } = useToast();

  async function playAlbum(id: number, fromTrackId?: number) {
    try {
      const album = await queryClient.fetchQuery({
        queryKey: ['album', id],
        queryFn: () => apiClient.get<AlbumDetail>(`/albums/${id}`),
      });
      const queue = albumQueue(album);
      const at = fromTrackId === undefined ? 0 : Math.max(0, queue.findIndex((t) => t.id === fromTrackId));
      playQueue(queue, at, undefined, { kind: 'album', id });
    } catch {
      showToast('Could not load that album. Try again.');
    }
  }

  async function playPlaylist(id: number, fromTrackId?: number) {
    try {
      const playlist = await queryClient.fetchQuery({
        queryKey: ['playlist', id],
        queryFn: () => apiClient.get<PlaylistDetail>(`/playlists/${id}`),
      });
      const queue = playlistQueue(playlist);
      if (queue.length === 0) {
        showToast('That playlist is empty.');
        return;
      }
      const at = fromTrackId === undefined ? 0 : Math.max(0, queue.findIndex((t) => t.id === fromTrackId));
      playQueue(queue, at, undefined, { kind: 'playlist', id });
    } catch {
      showToast('Could not load that playlist. Try again.');
    }
  }

  return { playAlbum, playPlaylist };
}
