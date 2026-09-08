import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, apiClient } from '../lib/apiClient';
import type { PlaylistSummary } from '../types/api';
import { useToast } from './ToastProvider';

interface AddToPlaylistDialogProps {
  trackId: number;
  trackTitle: string;
  onClose: () => void;
}

export function AddToPlaylistDialog({ trackId, trackTitle, onClose }: AddToPlaylistDialogProps) {
  const [newName, setNewName] = useState('');
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiClient.get<{ playlists: PlaylistSummary[] }>('/playlists'),
  });

  const addMutation = useMutation({
    mutationFn: (playlistId: number) =>
      apiClient.post(`/playlists/${playlistId}/tracks`, { trackId }),
    onSuccess: (_result, playlistId) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
      showToast(`Added to playlist`);
      onClose();
    },
    onError: (err) => {
      // 409 is the backend saying it's already there — a statement of fact,
      // not a failure the user needs to act on.
      if (err instanceof ApiError && err.status === 409) {
        showToast('Already in that playlist');
        onClose();
        return;
      }
      showToast(err instanceof Error ? err.message : 'Could not add to playlist', 'error');
    },
  });

  const createAndAddMutation = useMutation({
    mutationFn: async (name: string) => {
      const playlist = await apiClient.post<PlaylistSummary>('/playlists', { name });
      await apiClient.post(`/playlists/${playlist.id}/tracks`, { trackId });
      return playlist;
    },
    onSuccess: (playlist) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      showToast(`Added to “${playlist.name}”`);
      onClose();
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Could not create playlist', 'error'),
  });

  const busy = addMutation.isPending || createAndAddMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-sm font-semibold text-white">Add to playlist</h2>
        <p className="mb-3 truncate text-xs text-blue-300">{trackTitle}</p>

        {isLoading && <p className="text-sm text-blue-300">Loading playlists…</p>}

        {data && data.playlists.length > 0 && (
          <ul className="mb-4 max-h-48 divide-y divide-blue-800/60 overflow-y-auto rounded-md border border-blue-800">
            {data.playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  onClick={() => addMutation.mutate(playlist.id)}
                  disabled={busy}
                  className="flex w-full items-baseline gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-800/60 disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{playlist.name}</span>
                  <span className="shrink-0 font-mono text-xs text-blue-400">{playlist.trackCount}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {data && data.playlists.length === 0 && (
          <p className="mb-4 text-sm text-blue-300">No playlists yet — make one below.</p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = newName.trim();
            if (trimmed) createAndAddMutation.mutate(trimmed);
          }}
          className="flex gap-2"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New playlist…"
            className="input"
            aria-label="New playlist name"
          />
          <button type="submit" disabled={!newName.trim() || busy} className="btn-primary btn-sm shrink-0">
            Create
          </button>
        </form>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="btn-secondary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
