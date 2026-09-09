import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CoverArt } from '../components/CoverArt';
import { FavoriteButton, useFavoriteIds } from '../components/FavoriteButton';
import { usePlayer, type QueueTrack } from '../components/PlayerBar';
import { useToast } from '../components/ToastProvider';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiClient } from '../lib/apiClient';
import type { PlaylistDetail } from '../types/api';
import { PlayIcon } from '../components/icons';

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const playlistId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { playQueue } = usePlayer();
  const favoriteIds = useFavoriteIds();

  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useScrollLock(confirmingDelete);

  const queryKey = ['playlist', playlistId];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<PlaylistDetail>(`/playlists/${playlistId}`),
    enabled: Number.isInteger(playlistId),
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => apiClient.patch(`/playlists/${playlistId}`, { name }),
    onSuccess: () => {
      setRenaming(null);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Rename failed', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/playlists/${playlistId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      showToast('Playlist deleted');
      navigate('/playlists');
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (trackId: number) => apiClient.delete(`/playlists/${playlistId}/tracks/${trackId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Could not remove track', 'error'),
  });

  // The reordered list is held in the query cache rather than component state,
  // so there's no second copy of the order to keep in sync — the drag writes
  // the new order optimistically and the request either confirms it or the
  // rollback puts the old one back.
  const reorderMutation = useMutation({
    mutationFn: (trackIds: number[]) =>
      apiClient.patch<PlaylistDetail>(`/playlists/${playlistId}/tracks/reorder`, { trackIds }),
    onMutate: async (trackIds) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PlaylistDetail>(queryKey);

      if (previous) {
        const byId = new Map(previous.tracks.map((t) => [t.id, t]));
        queryClient.setQueryData<PlaylistDetail>(queryKey, {
          ...previous,
          tracks: trackIds.map((tid, i) => ({ ...byId.get(tid)!, position: i })),
        });
      }

      return { previous };
    },
    onError: (err, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      showToast(err instanceof Error ? err.message : 'Could not reorder', 'error');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (isLoading) return <p className="text-sm text-blue-300">Loading playlist…</p>;
  if (isError || !data) return <p className="text-sm text-red-400">Could not load that playlist.</p>;

  const queue: QueueTrack[] = data.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    format: t.format,
  }));

  function handleDrop(targetIndex: number) {
    setDragOverIndex(null);
    const from = dragIndex;
    setDragIndex(null);
    if (from === null || from === targetIndex || !data) return;

    const ids = data.tracks.map((t) => t.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(targetIndex, 0, moved);
    reorderMutation.mutate(ids);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-widest text-blue-400">Playlist</span>

        {renaming === null ? (
          <h1 className="text-2xl font-semibold text-white">{data.name}</h1>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = renaming.trim();
              if (trimmed) renameMutation.mutate(trimmed);
            }}
            className="flex max-w-md gap-2"
          >
            <input
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              className="input"
              aria-label="Playlist name"
              autoFocus
            />
            <button type="submit" className="btn-primary btn-sm shrink-0">
              Save
            </button>
            <button type="button" onClick={() => setRenaming(null)} className="btn-secondary btn-sm shrink-0">
              Cancel
            </button>
          </form>
        )}

        <p className="text-sm text-blue-200">
          {data.tracks.length} track{data.tracks.length === 1 ? '' : 's'}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => playQueue(queue, 0)}
            disabled={queue.length === 0}
            className="btn-primary btn-md"
          >
            <PlayIcon className="h-3.5 w-3.5" /> Play
          </button>
          {renaming === null && (
            <button onClick={() => setRenaming(data.name)} className="btn-secondary btn-md">
              Rename
            </button>
          )}
          <button onClick={() => setConfirmingDelete(true)} className="btn-danger btn-md">
            Delete playlist
          </button>
        </div>
      </div>

      {data.tracks.length === 0 ? (
        <p className="text-sm text-blue-300">
          Empty. Add tracks from the ⋮ menu on any track in the library.
        </p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-blue-800 text-left font-mono text-xs uppercase tracking-wider text-blue-400">
              <tr>
                <th className="w-12 py-2.5 pl-4">#</th>
                <th className="py-2.5 pr-3">Title</th>
                <th className="py-2.5 pr-3">Artist</th>
                <th className="py-2.5 pr-4 text-right">Duration</th>
                <th className="w-10 py-2.5"></th>
                <th className="w-10 py-2.5 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-800/60">
              {data.tracks.map((track, i) => (
                <tr
                  key={track.id}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => {
                    e.preventDefault(); // required, or the drop never fires
                    setDragOverIndex(i);
                  }}
                  onDragLeave={() => setDragOverIndex((current) => (current === i ? null : current))}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onClick={() => playQueue(queue, i)}
                  className={`cursor-pointer transition-colors hover:bg-blue-800/40 ${
                    dragOverIndex === i ? 'bg-orange-600/20' : ''
                  } ${dragIndex === i ? 'opacity-50' : ''}`}
                >
                  <td className="py-2.5 pl-4 tabular-nums text-blue-400">
                    <span className="cursor-grab select-none pr-1 text-blue-500" title="Drag to reorder">
                      ⠿
                    </span>
                    {i + 1}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-white">
                    <div className="flex items-center gap-2.5">
                      <CoverArt kind="tracks" id={track.id} className="h-9 w-9" />
                      <span className="truncate">{track.title}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-blue-200">{track.artist ?? '—'}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-blue-200">
                    {formatDuration(track.duration)}
                  </td>
                  <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                    <FavoriteButton trackId={track.id} isFavorited={favoriteIds.has(track.id)} />
                  </td>
                  <td className="py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => removeMutation.mutate(track.id)}
                      className="text-blue-400 transition-colors hover:text-red-400"
                      aria-label={`Remove ${track.title} from playlist`}
                      title="Remove from playlist"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmingDelete(false)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-sm font-semibold text-white">Delete “{data.name}”?</h2>
            <p className="mb-4 text-xs text-blue-400">
              The playlist is removed. The tracks themselves stay in your library.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmingDelete(false)} className="btn-secondary btn-sm">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="btn-danger btn-sm"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
