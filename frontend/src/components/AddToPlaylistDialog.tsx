import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import { ApiError, apiClient } from '../lib/apiClient';
import { checkPlaylistName } from '../lib/playlistName';
import type { PlaylistSummary } from '../types/api';
import { CoverArt } from './CoverArt';
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from './icons';
import { PlaylistNameField } from './PlaylistNameField';
import { useToast } from './ToastProvider';

interface AddToPlaylistDialogProps {
  trackId: number;
  trackTitle: string;
  trackArtist?: string | null;
  onClose: () => void;
}

/** From this many playlists a filter shows above the list. */
const FILTER_FROM = 6;

type ListedPlaylist = PlaylistSummary & { hasTrack: boolean };

/**
 * Puts one song in your playlists. Each row is a switch: a tick means the song is in it, and a tap adds or takes it
 * out, so it can go in several at once; Done closes. "New playlist" names one inline and adds the song to it. The list
 * comes with `?trackId=`, so the ticks are right on open.
 */
export function AddToPlaylistDialog({ trackId, trackTitle, trackArtist, onClose }: AddToPlaylistDialogProps) {
  useScrollLock();

  const titleId = useId();
  const nameFieldId = useId();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [triedToSave, setTriedToSave] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // Rows with an add or take-out on its way. Per row, so a tap on another row doesn't free this one for a second try.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(() => new Set());

  const queryKey = ['playlists', 'with-track', trackId];
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey,
    queryFn: () => apiClient.get<{ playlists: ListedPlaylist[] }>(`/playlists?trackId=${trackId}`),
  });
  const playlists = data?.playlists;
  const hasNone = playlists?.length === 0;
  // With nothing to pick, naming one is the only thing to do here.
  const showForm = creating || hasNone;

  /** Flips one row in the cached list, so the tick moves before the refetch lands. */
  function markInCache(playlistId: number, hasTrack: boolean) {
    queryClient.setQueryData<{ playlists: ListedPlaylist[] }>(queryKey, (old) =>
      old && {
        playlists: old.playlists.map((p) =>
          p.id === playlistId && p.hasTrack !== hasTrack
            ? { ...p, hasTrack, trackCount: p.trackCount + (hasTrack ? 1 : -1) }
            : p,
        ),
      },
    );
  }

  function refreshElsewhere(playlistId: number) {
    queryClient.invalidateQueries({ queryKey: ['playlists'] });
    queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
  }

  const toggleMutation = useMutation({
    onMutate: (playlist: ListedPlaylist) => setPendingIds((ids) => new Set(ids).add(playlist.id)),
    onSettled: (_res, _err, playlist) =>
      setPendingIds((ids) => {
        const next = new Set(ids);
        next.delete(playlist.id);
        return next;
      }),
    mutationFn: async (playlist: ListedPlaylist) => {
      if (playlist.hasTrack) {
        await apiClient.delete(`/playlists/${playlist.id}/tracks/${trackId}`);
      } else {
        await apiClient.post(`/playlists/${playlist.id}/tracks`, { trackId });
      }
    },
    onSuccess: (_res, playlist) => {
      markInCache(playlist.id, !playlist.hasTrack);
      showToast(playlist.hasTrack ? `Taken out of “${playlist.name}”` : `Added to “${playlist.name}”`);
      refreshElsewhere(playlist.id);
    },
    onError: (err, playlist) => {
      // 409: it was added somewhere else meanwhile. The song is where it was meant to go, so show the tick.
      if (err instanceof ApiError && err.status === 409) {
        markInCache(playlist.id, true);
        refreshElsewhere(playlist.id);
        return;
      }
      showToast(err instanceof Error ? err.message : 'Could not change that playlist', 'error');
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const playlist = await apiClient.post<PlaylistSummary>('/playlists', { name });
      // The playlist exists from here on, so a failed add is reported as that, not as a failed create: trying the
      // create again would make a second one.
      const added = await apiClient.post(`/playlists/${playlist.id}/tracks`, { trackId }).then(
        () => true,
        () => false,
      );
      return { playlist, added };
    },
    onSuccess: ({ playlist, added }) => {
      queryClient.setQueryData<{ playlists: ListedPlaylist[] }>(queryKey, (old) => ({
        playlists: [
          { ...playlist, trackCount: added ? 1 : 0, isPublic: false, coverAlbumIds: [], hasTrack: added },
          ...(old?.playlists ?? []),
        ],
      }));
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      if (added) showToast(`Made “${playlist.name}” with this song in it`);
      else showToast(`Made “${playlist.name}”, but couldn't add the song. Tap it to try again.`, 'error');
      setCreating(false);
      setNewName('');
      setTriedToSave(false);
      setFilter('');
    },
    onError: (err) => setServerError(err instanceof Error ? err.message : 'Could not make the playlist'),
  });

  const takenNames = playlists?.map((p) => p.name) ?? [];
  const nameCheck = checkPlaylistName(newName, takenNames, { reportBlank: triedToSave });

  function submitNew(e: FormEvent) {
    e.preventDefault();
    setTriedToSave(true);
    const check = checkPlaylistName(newName, takenNames, { reportBlank: true });
    if (check.error) {
      nameInputRef.current?.focus();
      return;
    }
    createMutation.mutate(check.trimmed);
  }

  function startCreating(prefill = '') {
    setNewName(prefill);
    setTriedToSave(false);
    setServerError(null);
    setCreating(true);
  }

  function cancelCreating() {
    setCreating(false);
    setTriedToSave(false);
    setServerError(null);
  }

  // Focus moves into the dialog on open, and back to whatever opened it on close if that is still on the page (a
  // menu item that opened it is gone by then).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    if (creating) nameInputRef.current?.focus();
  }, [creating]);

  // Escape closes; Tab stays inside the dialog.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const query = filter.trim().toLocaleLowerCase();
  const shown = query ? playlists?.filter((p) => p.name.toLocaleLowerCase().includes(query)) : playlists;
  const inCount = playlists?.filter((p) => p.hasTrack).length ?? 0;

  // On <body>, so the sticky site header (its own stacking context) can't sit on top of the dimmed page.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="card flex max-h-[88dvh] w-full flex-col rounded-b-none outline-none sm:max-w-md sm:rounded-b-xl"
      >
        {/* The song, so it's clear what is being added. */}
        <div className="flex items-center gap-3 border-b border-blue-800 p-4">
          <CoverArt kind="tracks" id={trackId} className="h-14 w-14" />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xs font-medium text-blue-300">
              Add to playlist
            </h2>
            <p className="font-display truncate text-xl font-extrabold leading-tight text-white">{trackTitle}</p>
            {trackArtist && <p className="truncate text-xs text-blue-200">{trackArtist}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="btn-ghost tap-target shrink-0 self-start p-1.5">
            <CloseIcon />
          </button>
        </div>

        {playlists && playlists.length >= FILTER_FROM && (
          <div className="relative border-b border-blue-800 px-4 py-3">
            <SearchIcon className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Find one of your ${playlists.length} playlists`}
              aria-label="Find a playlist"
              autoComplete="off"
              className="input pl-9"
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* New playlist: a row until it's picked, then the name form in its place. */}
          {showForm ? (
            <form onSubmit={submitNew} noValidate className="flex flex-col gap-2 border-b border-blue-800 px-4 py-3">
              <p className="text-xs text-blue-200">
                {hasNone ? 'You have no playlists yet. Name the first one and this song goes in it.' : 'New playlist, with this song in it'}
              </p>
              <div className="flex items-start gap-2">
                <PlaylistNameField
                  id={nameFieldId}
                  inputRef={nameInputRef}
                  value={newName}
                  onChange={(v) => {
                    setNewName(v);
                    setServerError(null);
                  }}
                  check={nameCheck}
                  serverError={serverError}
                  placeholder="Name it, like “Late night drives”"
                  onEscape={hasNone ? undefined : cancelCreating}
                />
                <button type="submit" disabled={createMutation.isPending} className="btn-primary btn-md shrink-0">
                  {createMutation.isPending ? 'Making…' : 'Create'}
                </button>
              </div>
              {!hasNone && (
                <button type="button" onClick={cancelCreating} className="btn-ghost btn-sm self-start">
                  Cancel
                </button>
              )}
            </form>
          ) : (
            playlists && (
              <button
                onClick={() => startCreating()}
                className="flex w-full items-center gap-3 border-b border-blue-800 px-4 py-3 text-left transition-colors hover:bg-blue-800/60 focus-visible:bg-blue-800/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-blue-500 text-accent-ink">
                  <PlusIcon />
                </span>
                <span className="text-sm font-medium text-white">New playlist</span>
              </button>
            )
          )}

          {isLoading && (
            <ul aria-busy="true" aria-label="Loading your playlists">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="skeleton h-10 w-10 shrink-0 rounded-md" />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span className="skeleton h-3 w-2/5 rounded" />
                    <span className="skeleton h-2.5 w-1/5 rounded" />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {isError && (
            <div role="alert" className="flex flex-col items-start gap-2 px-4 py-5">
              <p className="text-sm text-red-300">Couldn't load your playlists.</p>
              <button onClick={() => refetch()} disabled={isRefetching} className="btn-secondary btn-sm">
                {isRefetching ? 'Trying…' : 'Try again'}
              </button>
            </div>
          )}

          {shown && shown.length > 0 && (
            <ul>
              {shown.map((playlist) => {
                const busy = pendingIds.has(playlist.id);
                return (
                  <li key={playlist.id}>
                    <button
                      onClick={() => toggleMutation.mutate(playlist)}
                      disabled={busy}
                      aria-pressed={playlist.hasTrack}
                      className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-blue-800/60 focus-visible:bg-blue-800/60 disabled:cursor-wait ${
                        playlist.hasTrack ? 'bg-blue-800/30' : ''
                      }`}
                    >
                      {playlist.coverAlbumIds.length > 0 ? (
                        <CoverArt kind="albums" id={playlist.coverAlbumIds[0]} className="h-10 w-10" />
                      ) : (
                        <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-blue-700 bg-blue-950" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{playlist.name}</span>
                        <span className="block truncate text-xs text-blue-300">
                          {playlist.trackCount} song{playlist.trackCount === 1 ? '' : 's'}
                          {playlist.isPublic && ' · Public'}
                        </span>
                      </span>
                      <span
                        className={`flex shrink-0 items-center gap-1 text-xs font-medium ${
                          playlist.hasTrack
                            ? 'text-accent-ink group-hover:text-red-300 group-focus-visible:text-red-300'
                            : 'text-blue-300 group-hover:text-white'
                        }`}
                      >
                        {busy ? (
                          playlist.hasTrack ? 'Taking out…' : 'Adding…'
                        ) : playlist.hasTrack ? (
                          <>
                            <CheckIcon />
                            <span className="group-hover:hidden group-focus-visible:hidden">Added</span>
                            <span className="hidden group-hover:inline group-focus-visible:inline">Take out</span>
                          </>
                        ) : (
                          <>
                            <PlusIcon /> Add
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {query && shown?.length === 0 && (
            <div className="flex flex-col items-start gap-2 px-4 py-5">
              <p className="text-sm text-blue-200">None of your playlists is called anything like “{filter.trim()}”.</p>
              {!showForm && (
                <button onClick={() => startCreating(filter.trim())} className="btn-secondary btn-sm">
                  <PlusIcon className="h-3.5 w-3.5" /> Make “{filter.trim()}”
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-blue-800 px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-xs text-blue-300" aria-live="polite">
            {playlists && playlists.length > 0
              ? inCount === 0
                ? 'Not in any of your playlists yet'
                : `In ${inCount} of your playlists`
              : ''}
          </p>
          <button onClick={onClose} className="btn-secondary btn-md shrink-0">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
