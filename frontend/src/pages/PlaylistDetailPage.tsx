import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { CoverArt } from '../components/CoverArt';
import { FavoriteButton, useFavoriteIds } from '../components/FavoriteButton';
import { PlaylistNameField } from '../components/PlaylistNameField';
import { usePlayer, type QueueTrack } from '../components/PlayerBar';
import { useToast } from '../components/ToastProvider';
import { useScrollLock } from '../hooks/useScrollLock';
import { apiClient } from '../lib/apiClient';
import { checkPlaylistName } from '../lib/playlistName';
import type { PlaylistDetail, PlaylistSummary } from '../types/api';
import { PlayIcon } from '../components/icons';
import { Skeleton, SkeletonDetailHeader, SkeletonTrackRows } from '../components/Skeleton';

/** A shuffled copy, for the Shuffle button: the queue starts at a random song and runs in random order. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Longest description, in characters (an emoji is one). Matches `MAX_DESCRIPTION_LENGTH` on the server. */
const MAX_DESCRIPTION = 300;

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
  const { user } = useAuth();

  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameFieldId = useId();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The description being edited, or null while it's only shown (A185).
  const [describing, setDescribing] = useState<string | null>(null);
  const descriptionFieldId = useId();
  // Another playlist in the same page (a link from this one): an open rename or description draft stays behind.
  const [shownId, setShownId] = useState(playlistId);
  if (shownId !== playlistId) {
    setShownId(playlistId);
    setDescribing(null);
    setRenaming(null);
  }
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
    onSuccess: (_res, name) => {
      setRenaming(null);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      showToast(`Renamed to “${name}”`);
    },
    onError: (err) => setRenameError(err instanceof Error ? err.message : 'Rename failed'),
  });

  // Your other playlists' names, only while renaming, for the duplicate warning.
  const mine = useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiClient.get<{ playlists: PlaylistSummary[] }>('/playlists'),
    enabled: renaming !== null,
  });
  const takenNames = mine.data?.playlists.filter((p) => p.id !== playlistId).map((p) => p.name) ?? [];
  const renameCheck = checkPlaylistName(renaming ?? '', takenNames, { ownName: data?.name, reportBlank: true });

  // Blank clears it on the server.
  const describeMutation = useMutation({
    mutationFn: (description: string) =>
      apiClient.patch<PlaylistSummary>(`/playlists/${playlistId}`, { description }),
    onSuccess: (_res, description) => {
      setDescribing(null);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      showToast(description.trim() ? 'Description saved' : 'Description removed');
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Could not save the description', 'error'),
  });

  // The public switch (A162): everyone signed in on this server sees it under "From others" and in search.
  const publicMutation = useMutation({
    mutationFn: (isPublic: boolean) => apiClient.patch(`/playlists/${playlistId}`, { isPublic }),
    onSuccess: (_res, isPublic) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      showToast(isPublic ? 'Public: everyone here can find and play it' : 'Private: only you see it now');
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Could not change that', 'error'),
  });

  // Save a copy (A162): someone else's playlist becomes a private one of your own.
  const copyMutation = useMutation({
    mutationFn: () => apiClient.post<PlaylistSummary>(`/playlists/${playlistId}/copy`),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      showToast(`Saved as “${created.name}”`);
      navigate(`/playlists/${created.id}`);
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Could not save a copy', 'error'),
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

  // The order lives in the query cache: written optimistically, confirmed or rolled back by the request.
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

  if (isLoading) {
    return (
      <Skeleton label="Loading playlist…">
        <SkeletonDetailHeader />
        <SkeletonTrackRows />
      </Skeleton>
    );
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-red-300">
        Could not load that playlist. It may have been deleted, or its owner made it private.
      </p>
    );
  }

  const isOwner = data.isOwner;
  const descriptionLength = [...(describing ?? '').trim()].length;

  const queue: QueueTrack[] = data.tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    duration: t.duration,
    gainDb: t.gainDb,
    format: t.format,
    albumId: t.albumId,
    trackNumber: t.trackNumber,
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
              if (renameCheck.error) {
                renameInputRef.current?.focus();
                return;
              }
              // Unchanged: nothing to save.
              if (renameCheck.trimmed === data.name) {
                setRenaming(null);
                return;
              }
              renameMutation.mutate(renameCheck.trimmed);
            }}
            noValidate
            className="flex max-w-md items-start gap-2"
          >
            <PlaylistNameField
              id={renameFieldId}
              inputRef={renameInputRef}
              value={renaming}
              onChange={(v) => {
                setRenaming(v);
                setRenameError(null);
              }}
              check={renameCheck}
              serverError={renameError}
              autoFocus
              onEscape={() => setRenaming(null)}
            />
            <button type="submit" disabled={renameMutation.isPending} className="btn-primary btn-md shrink-0">
              {renameMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setRenaming(null)} className="btn-secondary btn-md shrink-0">
              Cancel
            </button>
          </form>
        )}

        {describing === null ? (
          data.description && (
            <p className="max-w-2xl whitespace-pre-line text-sm text-blue-100">{data.description}</p>
          )
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (descriptionLength > MAX_DESCRIPTION) return;
              if (describing.trim() === (data.description ?? '')) {
                setDescribing(null);
                return;
              }
              describeMutation.mutate(describing.trim());
            }}
            className="flex max-w-xl flex-col gap-2"
          >
            <label htmlFor={descriptionFieldId} className="text-xs text-blue-400">
              Description
            </label>
            <textarea
              id={descriptionFieldId}
              value={describing}
              onChange={(e) => setDescribing(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setDescribing(null);
              }}
              rows={3}
              autoFocus
              placeholder="What it's for, like “slow songs for the drive home”"
              aria-describedby={`${descriptionFieldId}-count`}
              aria-invalid={descriptionLength > MAX_DESCRIPTION}
              className="input w-full resize-y"
            />
            <div className="flex items-center gap-2">
              <span
                id={`${descriptionFieldId}-count`}
                className={`mr-auto font-mono text-xs tabular-nums ${
                  descriptionLength > MAX_DESCRIPTION ? 'text-red-300' : 'text-blue-400'
                }`}
              >
                {descriptionLength}/{MAX_DESCRIPTION}
              </span>
              <button type="button" onClick={() => setDescribing(null)} className="btn-secondary btn-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={describeMutation.isPending || descriptionLength > MAX_DESCRIPTION}
                className="btn-primary btn-sm"
              >
                {describeMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}

        <p className="text-sm text-blue-200">
          {!isOwner && (
            <>
              by{' '}
              <Link to={`/people/${data.ownerId}`} className="text-white underline-offset-2 hover:underline">
                {data.ownerName}
              </Link>{' '}
              ·{' '}
            </>
          )}
          {data.tracks.length} track{data.tracks.length === 1 ? '' : 's'}
          {isOwner && (data.isPublic ? ' · Public' : ' · Only you')}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => playQueue(queue, 0)}
            disabled={queue.length === 0}
            className="btn-primary btn-md"
          >
            <PlayIcon className="h-3.5 w-3.5" /> Play
          </button>
          <button
            onClick={() => playQueue(shuffled(queue), 0)}
            disabled={queue.length === 0}
            className="btn-secondary btn-md"
          >
            Shuffle
          </button>
          {isOwner ? (
            <>
              {renaming === null && (
                <button
                  onClick={() => {
                    setRenameError(null);
                    setRenaming(data.name);
                  }}
                  className="btn-secondary btn-md"
                >
                  Rename
                </button>
              )}
              {describing === null && (
                <button onClick={() => setDescribing(data.description ?? '')} className="btn-secondary btn-md">
                  {data.description ? 'Edit description' : 'Add a description'}
                </button>
              )}
              <button onClick={() => setConfirmingDelete(true)} className="btn-danger btn-md">
                Delete playlist
              </button>
            </>
          ) : (
            !user?.isGuest && (
              <button
                onClick={() => copyMutation.mutate()}
                disabled={copyMutation.isPending}
                className="btn-secondary btn-md"
              >
                {copyMutation.isPending ? 'Saving…' : 'Save a copy'}
              </button>
            )
          )}
        </div>

        {isOwner && (
          <label className="mt-2 flex max-w-xl items-start gap-2 text-sm text-blue-200">
            <input
              type="checkbox"
              checked={data.isPublic}
              disabled={publicMutation.isPending}
              onChange={(e) => publicMutation.mutate(e.target.checked)}
              className="mt-0.5 accent-orange-600"
            />
            <span>
              Public
              <span className="block text-xs text-blue-400">
                Everyone on this server can find it, play it and save a copy. Only you can change it.
              </span>
            </span>
          </label>
        )}
      </div>

      {data.tracks.length === 0 ? (
        <p className="text-sm text-blue-300">
          {isOwner ? 'Empty. Add tracks from the ⋮ menu on any track in the library.' : 'This playlist is empty.'}
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
                  draggable={isOwner}
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
                  className={`group cursor-pointer transition-colors hover:bg-blue-800/40 ${
                    dragOverIndex === i ? 'bg-orange-600/20' : ''
                  } ${dragIndex === i ? 'opacity-50' : ''}`}
                >
                  <td className="py-2.5 pl-4 tabular-nums text-blue-400 group-hover:text-blue-300">
                    {isOwner && (
                      <span className="cursor-grab select-none pr-1 text-blue-500" title="Drag to reorder">
                        ⠿
                      </span>
                    )}
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
                    {isOwner && (
                    <button
                      onClick={() => removeMutation.mutate(track.id)}
                      className="tap-target text-blue-400 transition-colors hover:text-red-300"
                      aria-label={`Remove ${track.title} from playlist`}
                      title="Remove from playlist"
                    >
                      ✕
                    </button>
                    )}
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
