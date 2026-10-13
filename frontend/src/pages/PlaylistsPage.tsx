import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { PlaylistListItem } from '../components/PlaylistListItem';
import { useToast } from '../components/ToastProvider';
import { apiClient } from '../lib/apiClient';
import type { PlaylistSummary, PublicPlaylistSummary } from '../types/api';
import { Skeleton, SkeletonListRows } from '../components/Skeleton';

/** Your playlists, then other people's public ones, newest public first (A162, A166). A guest sees only the second (A163). */
export function PlaylistsPage() {
  const [name, setName] = useState('');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isGuest = Boolean(user?.isGuest);

  const mine = useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiClient.get<{ playlists: PlaylistSummary[] }>('/playlists'),
    enabled: !isGuest,
  });
  const others = useQuery({
    queryKey: ['playlists', 'public'],
    queryFn: () => apiClient.get<{ playlists: PublicPlaylistSummary[] }>('/playlists/public'),
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Playlists</h1>
        <p className="text-sm text-blue-300">
          {isGuest
            ? 'Playlists other people have made public. Make an account to keep your own.'
            : 'Yours, and the ones other people made public.'}
        </p>
      </div>

      {!isGuest && (
        <section aria-labelledby="mine-heading" className="flex flex-col gap-3">
          <h2 id="mine-heading" className="flex items-baseline gap-2 text-sm font-semibold text-white">
            Mine
            {mine.data && (
              <span className="font-mono text-xs font-normal tabular-nums text-blue-400">{mine.data.playlists.length}</span>
            )}
          </h2>
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

          {mine.isLoading && (
            <Skeleton label="Loading playlists…">
              <SkeletonListRows rows={4} />
            </Skeleton>
          )}
          {mine.isError && <p className="text-sm text-red-300">Could not load your playlists. Reload to try again.</p>}
          {mine.data && mine.data.playlists.length === 0 && (
            <p className="text-sm text-blue-300">
              No playlists yet. Create one above, then add tracks from the ⋮ menu on any track.
            </p>
          )}
          {mine.data && mine.data.playlists.length > 0 && (
            <ul className="card divide-y divide-blue-800/60 overflow-hidden">
              {mine.data.playlists.map((p) => (
                <li key={p.id}>
                  <PlaylistListItem
                    id={p.id}
                    name={p.name}
                    trackCount={p.trackCount}
                    coverAlbumIds={p.coverAlbumIds}
                    isPublic={p.isPublic}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="others-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="others-heading" className="flex items-baseline gap-2 text-sm font-semibold text-white">
            From others
            {others.data && (
              <span className="font-mono text-xs font-normal tabular-nums text-blue-400">
                {others.data.playlists.length}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-blue-300">Newest first. Play them, or save a copy to make it your own.</p>
        </div>
        {others.isLoading && (
          <Skeleton label="Loading public playlists…">
            <SkeletonListRows rows={3} />
          </Skeleton>
        )}
        {others.isError && <p className="text-sm text-red-300">Could not load public playlists. Reload to try again.</p>}
        {others.data && others.data.playlists.length === 0 && (
          <p className="text-sm text-blue-300">
            Nobody has made a playlist public yet.
            {!isGuest && ' Open one of yours and switch it to Public to share it here.'}
          </p>
        )}
        {others.data && others.data.playlists.length > 0 && (
          <ul className="card divide-y divide-blue-800/60 overflow-hidden">
            {others.data.playlists.map((p) => (
              <li key={p.id}>
                <PlaylistListItem
                  id={p.id}
                  name={p.name}
                  trackCount={p.trackCount}
                  coverAlbumIds={p.coverAlbumIds}
                  ownerId={p.ownerId}
                  ownerName={p.ownerName}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
