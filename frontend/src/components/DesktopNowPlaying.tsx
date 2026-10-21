import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useCoverTint } from '../hooks/useCoverTint';
import { useFoldRemove } from '../hooks/useFoldRemove';
import { useScrollLock } from '../hooks/useScrollLock';
import { useSwapClass } from '../hooks/useSwapClass';
import { apiClient } from '../lib/apiClient';
import { formatClock } from '../lib/format';
import type { AlbumDetail } from '../types/api';
import { AddedBy } from './AddedBy';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import { CoverArt } from './CoverArt';
import { FavoriteButton, useFavoriteIds } from './FavoriteButton';
import { ChevronDownIcon, CloseIcon, PauseIcon, PlayIcon, PlusIcon, RadioIcon } from './icons';
import type { PlayerContextValue } from './PlayerBar';
import { Presence } from './Presence';
import { RelatedTab } from './RelatedTab';

type Tab = 'queue' | 'related';

const TABS: { id: Tab; label: string }[] = [
  { id: 'queue', label: 'Up next' },
  { id: 'related', label: 'Related' },
];

/** Three bars that move while the song plays. They mark which row is current, so they stop with the music. */
function LevelMeter({ playing }: { playing: boolean }) {
  return (
    <span aria-hidden className={`np-eq ${playing ? 'is-playing' : ''}`}>
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * Full-screen Now Playing for wide screens: the cover on the left, the queue and related songs on the right, washed
 * with the cover's colour. The bar stays visible and in charge underneath it. Phones have `NowPlaying` instead.
 */
export function DesktopNowPlaying({ player, onClose }: { player: PlayerContextValue; onClose: () => void }) {
  const { current, queue, index, isPlaying, playQueue, inRoom } = player;
  useScrollLock();

  const [tab, setTab] = useState<Tab>('queue');
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const { folding, fold } = useFoldRemove(player);
  const swapClass = useSwapClass(current?.id ?? 0, index);
  const favoriteIds = useFavoriteIds();
  const tint = useCoverTint(current?.id ?? 0);

  // Focus moves in on open and back to whatever opened the view on close.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Escape closes, unless a dialog on top of the view (add to playlist) is the thing to dismiss.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) return;
      onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const albumId = current?.albumId ?? null;
  const { data: album } = useQuery({
    queryKey: ['album', albumId],
    queryFn: () => apiClient.get<AlbumDetail>(`/albums/${albumId}`),
    enabled: albumId !== null,
    staleTime: 60_000,
  });
  const artistId = album?.artistId ?? null;

  if (!current) return null;

  const upNext = queue.slice(index + 1);
  const upNextSeconds = upNext.reduce((sum, t) => sum + (t.duration ?? 0), 0);

  return (
    <div
      role="region"
      aria-label="Now playing"
      style={{ '--np-tint': tint ?? 'var(--app-ground)' } as CSSProperties}
      className="np-desktop motion-view fixed inset-x-0 top-0 bottom-[4.5rem] z-[35] hidden flex-col text-white md:flex"
    >
      <div className="flex items-center gap-3 px-6 pt-4">
        <button ref={closeRef} onClick={onClose} className="btn-ghost btn-sm h-9 w-9 !px-0" aria-label="Close the full player" title="Close (Esc)">
          <ChevronDownIcon className="h-5 w-5" />
        </button>
        <span className="font-display text-xs font-extrabold uppercase tracking-[0.22em] text-blue-300">Now playing</span>
      </div>

      <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-12 px-8 pb-6 pt-4">
        <section className="flex min-h-0 flex-col items-center justify-center gap-5">
          <div
            key={current.id}
            className="np-art relative aspect-square overflow-hidden rounded-2xl border-2 border-orange-600"
            style={{ width: 'min(58vh, 36vw)' }}
          >
            <CoverArt kind="tracks" id={current.id} size="full" className="h-full w-full" alt="" />
          </div>

          <div key={`t${current.id}`} className={`${swapClass} w-full max-w-md text-center`}>
            <h2 className="font-display truncate text-4xl font-extrabold tracking-[0.01em] text-white">{current.title}</h2>
            <p className="mt-1 truncate text-sm text-blue-200">
              {artistId !== null && current.artist ? (
                <Link to={`/artists/${artistId}`} className="hover:text-orange-400 hover:underline">
                  {current.artist}
                </Link>
              ) : (
                (current.artist ?? 'Unknown Artist')
              )}
              {album && (
                <>
                  {' · '}
                  <Link to={`/albums/${album.id}`} className="hover:text-orange-400 hover:underline">
                    {album.title}
                  </Link>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-900/80">
              <FavoriteButton trackId={current.id} isFavorited={favoriteIds.has(current.id)} className="p-1" />
            </div>
            <button
              onClick={() => setAddingToPlaylist(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-900/80 text-blue-300 transition-[background-color,transform] duration-200 ease-[var(--ease-spring)] hover:bg-blue-800 active:scale-90"
              aria-label="Add to playlist"
            >
              <PlusIcon className="h-4.5 w-4.5" />
            </button>
            <button
              onClick={() => player.startRadio(current)}
              disabled={inRoom}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-900/80 text-blue-300 transition-[background-color,transform] duration-200 ease-[var(--ease-spring)] hover:bg-blue-800 active:scale-90 disabled:opacity-40"
              aria-label={inRoom ? 'Start radio (off in a room)' : 'Start radio'}
              title="Start radio: songs like this one"
            >
              <RadioIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        </section>

        <section className="flex min-h-0 flex-col">
          <div
            role="tablist"
            className="relative grid grid-cols-2 border-b border-blue-800"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              const next = tab === 'queue' ? 'related' : 'queue';
              setTab(next);
              document.getElementById(`np-d-tab-${next}`)?.focus();
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`np-d-tab-${t.id}`}
                role="tab"
                aria-selected={tab === t.id}
                aria-controls="np-d-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={`font-display py-3 text-sm font-extrabold uppercase tracking-[0.16em] transition-colors ${
                  tab === t.id ? 'text-white' : 'text-blue-400 hover:text-blue-200'
                }`}
              >
                {t.label}
              </button>
            ))}
            <span aria-hidden className="np-tab-underline" style={{ transform: `translateX(${tab === 'queue' ? 0 : 100}%)` }} />
          </div>

          <div key={tab} id="np-d-panel" role="tabpanel" aria-labelledby={`np-d-tab-${tab}`} className="route-in min-h-0 flex-1 overflow-y-auto pt-3">
            {tab === 'queue' ? (
              <>
                <div className="np-row flex items-center gap-3 rounded-xl bg-blue-900/70 px-3 py-2.5">
                  <LevelMeter playing={isPlaying} />
                  <CoverArt kind="tracks" id={current.id} className="h-10 w-10 shrink-0 rounded-md" alt="" />
                  <span className="min-w-0 flex-1">
                    <span className="player-title block truncate text-base text-white">{current.title}</span>
                    <span className="block truncate text-xs text-blue-300">{current.artist ?? 'Unknown Artist'}</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-blue-300">{formatClock(current.duration ?? 0)}</span>
                  <button
                    onClick={player.toggle}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-600 text-on-accent transition-transform duration-200 ease-[var(--ease-spring)] active:scale-90"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex items-baseline justify-between px-1 pb-1 pt-4">
                  <h3 className="font-display text-sm font-extrabold uppercase tracking-[0.14em] text-white">Up next</h3>
                  <span className="font-display text-xs font-extrabold uppercase tracking-[0.1em] text-blue-400">
                    {upNext.length === 0
                      ? 'End of queue'
                      : `${upNext.length} ${upNext.length === 1 ? 'track' : 'tracks'} · ${formatClock(upNextSeconds)}`}
                  </span>
                </div>

                <ul>
                  {upNext.map((track, i) => {
                    const at = index + 1 + i;
                    const isFolding = folding?.at === at && folding.id === track.id;
                    return (
                      <li
                        key={`${track.id}-${at}`}
                        className={`np-row-wrap motion-rise ${isFolding ? 'np-row-collapse' : ''}`}
                        style={{ '--i': i } as CSSProperties}
                      >
                        <div className="np-row-inner">
                          <div className="group flex items-center gap-1 rounded-xl transition-colors hover:bg-blue-900/70">
                            <button
                              onClick={() => player.goTo(at)}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left"
                            >
                              <span className="w-5 shrink-0 text-center font-mono text-xs tabular-nums text-blue-400">
                                {at + 1}
                              </span>
                              <CoverArt kind="tracks" id={track.id} className="h-10 w-10 shrink-0 rounded-md" alt="" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-white">{track.title}</span>
                                <span className="block truncate text-xs text-blue-300">{track.artist ?? 'Unknown Artist'}</span>
                              </span>
                              {inRoom && track.addedBy && <AddedBy person={track.addedBy} />}
                              <span className="font-mono text-xs tabular-nums text-blue-400">
                                {track.duration ? formatClock(track.duration) : ''}
                              </span>
                            </button>
                            <button
                              onClick={() => fold(at)}
                              className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-blue-400 opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-blue-800 hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                              aria-label={`Remove ${track.title} from the queue`}
                              title={inRoom ? 'Remove from the room queue' : 'Remove from the queue'}
                            >
                              <CloseIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <RelatedTab current={current} playQueue={playQueue} />
            )}
          </div>
        </section>
      </div>

      <Presence value={addingToPlaylist ? current : null}>
        {(t) => (
          <AddToPlaylistDialog
            trackId={t.id}
            trackTitle={t.title}
            trackArtist={t.artist}
            onClose={() => setAddingToPlaylist(false)}
          />
        )}
      </Presence>
    </div>
  );
}
