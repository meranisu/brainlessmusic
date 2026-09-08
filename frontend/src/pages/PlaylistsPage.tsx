import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { apiClient } from '../lib/apiClient';
import type { PlaylistSummary } from '../types/api';

export function PlaylistsPage() {
  const [name, setName] = useState('');
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiClient.get<{ playlists: PlaylistSummary[] }>('/playlists'),
  });

  const createMutation = useMutation({
    mutationFn: (playlistName: string) =>
      apiClient.post<PlaylistSummary>('/playlists', { name: playlistName }),
    onSuccess: (created) => {
      setName('');
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      showToast(`Created “${created.name}”`);
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Could not create playlist', 'error'),
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Playlists</h1>
        <p className="text-sm text-blue-300">
          {data ? `${data.playlists.length} playlist${data.playlists.length === 1 ? '' : 's'}` : 'Loading…'}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed) createMutation.mutate(trimmed);
        }}
        className="card flex gap-2 p-3"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New playlist name…"
          className="input"
          aria-label="New playlist name"
        />
        <button
          type="submit"
          disabled={!name.trim() || createMutation.isPending}
          className="btn-primary btn-md shrink-0"
        >
          Create
        </button>
      </form>

      {isLoading && <p className="text-sm text-blue-300">Loading playlists…</p>}
      {isError && <p className="text-sm text-red-400">Could not load playlists.</p>}

      {data && data.playlists.length === 0 && (
        <p className="text-sm text-blue-300">
          No playlists yet. Create one above, then add tracks from the ⋮ menu on any track.
        </p>
      )}

      {data && data.playlists.length > 0 && (
        <ul className="card divide-y divide-blue-800/60 overflow-hidden">
          {data.playlists.map((playlist) => (
            <li key={playlist.id}>
              <Link
                to={`/playlists/${playlist.id}`}
                className="flex items-baseline gap-3 px-4 py-3 transition-colors hover:bg-blue-800/40"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-white">{playlist.name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-blue-300">
                  {playlist.trackCount} track{playlist.trackCount === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
