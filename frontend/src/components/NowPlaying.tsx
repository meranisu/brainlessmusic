import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { apiClient } from '../lib/apiClient';
import { formatClock } from '../lib/format';
import type { TrackDetail } from '../types/api';
import { AddToPlaylistDialog } from './AddToPlaylistDialog';
import { CoverArt } from './CoverArt';
import { FavoriteButton, useFavoriteIds } from './FavoriteButton';
import {
  ChevronDownIcon,
  CloseIcon,
  DataSaverIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RadioIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  VolumeMutedIcon,
} from './icons';
import { useScrollLock } from '../hooks/useScrollLock';
import type { PlayerContextValue } from './PlayerBar';
import { Link } from 'react-router-dom';
import { useRoom } from './RoomProvider';
import { Presence } from './Presence';
import { useSwapClass } from '../hooks/useSwapClass';
import { useFoldRemove } from '../hooks/useFoldRemove';
import { RelatedTab } from './RelatedTab';

const WAVE_BARS = 44;

/** A placeholder waveform while peaks load or when there are none, seeded by track id so it doesn't reshuffle. */
function placeholderHeights(trackId: number): number[] {
  return Array.from({ length: WAVE_BARS }, (_, i) => {
    const seed = Math.sin((trackId + 1) * (i + 7) * 12.9898) * 43758.5453;
    return 0.28 + (seed - Math.floor(seed)) * 0.72;
  });
}

/** The tallest a quiet track's loudest bar may get, so quiet still reads as quiet. */
const QUIET_TRACK_CEILING = 0.55;

/**
 * Downsamples peaks by taking each span's max (averages flatten transients). Each track scales to its own loudest bar,
 * up to a ceiling that rises with loudness, since this quiet piano library peaks near 80 of 255.
 */
function barsFromPeaks(peaks: number[]): number[] {
  const span = peaks.length / WAVE_BARS;
  const bars = Array.from({ length: WAVE_BARS }, (_, i) => {
    const slice = peaks.slice(Math.floor(i * span), Math.max(Math.floor((i + 1) * span), Math.floor(i * span) + 1));
    return Math.max(...slice) / 255;
  });

  const loudest = Math.max(...bars);
  // An all-silent track has nothing to scale against; leave it as the flat line
  // the floor below draws rather than dividing by zero.
  const ceiling = QUIET_TRACK_CEILING + (1 - QUIET_TRACK_CEILING) * loudest;
  const scale = loudest > 0 ? ceiling / loudest : 0;

  // Floor at 0.06 so silence is still a visible line, not a gap in the bar.
  return bars.map((bar) => Math.max(0.06, bar * scale));
}

function totalQueueSeconds(durations: (number | null | undefined)[]): number {
  return durations.reduce<number>((sum, d) => sum + (d ?? 0), 0);
}

function pill(active: boolean): string {
  return `flex h-11 flex-1 items-center justify-center rounded-2xl transition-colors ${
    active ? 'bg-orange-600 text-on-accent' : 'bg-blue-900 text-blue-300 hover:bg-blue-800'
  }`;
}

/** Full-screen Now Playing, phone only: a second view of the same player state. */
export function NowPlaying({ player, onCollapse }: { player: PlayerContextValue; onCollapse: () => void }) {
  const {
    current,
    queue,
    index,
    isPlaying,
    isLoading,
    isBuffering,
    currentTime,
    duration,
    repeat,
    isShuffled,
    dataSaver,
    volume,
    servedLabel,
    toggle,
    next,
    previous,
    seek,
    goTo,
    cycleRepeat,
    toggleShuffle,
    setDataSaver,
    setVolume,
    toggleMute,
    stop,
    inRoom,
    startRadio,
  } = player;

  const swapClass = useSwapClass(current?.id ?? 0, index);
  const [tab, setTab] = useState<'queue' | 'related'>('queue');
  const { folding, fold } = useFoldRemove(player);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; active: boolean; dy: number } | null>(null);
  const favoriteIds = useFavoriteIds();
  const { room, connection } = useRoom();
  // Set only mid-drag. Seeking on every tick would fire a range request each time; seek once on release.
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const scrubRef = useRef<number | null>(null);
  scrubRef.current = scrubTime;
  const scrubbing = scrubTime !== null;
  // A drag can end outside the thin range input, so the release is caught on the window.
  useEffect(() => {
    if (!scrubbing) return;
    function commit() {
      if (scrubRef.current !== null) seek(scrubRef.current);
      setScrubTime(null);
    }
    window.addEventListener('pointerup', commit, { once: true });
    return () => window.removeEventListener('pointerup', commit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrubbing]);

  // The queue only carries what it needs to play; sample rate and bitrate live
  // on the full record. Same query key the bar invalidates after a scrobble.
  const { data: detail } = useQuery({
    queryKey: ['track', current?.id],
    queryFn: () => apiClient.get<TrackDetail>(`/tracks/${current!.id}`),
    enabled: current != null,
    staleTime: 60_000,
  });

  // Peaks are computed on first request, then cached. A 404 just keeps the placeholder.
  const { data: waveform } = useQuery({
    queryKey: ['waveform', current?.id],
    queryFn: () => apiClient.get<{ peaks: number[] }>(`/tracks/${current!.id}/waveform`),
    enabled: current != null,
    staleTime: Infinity,
    retry: false,
  });

  useScrollLock();

  if (!current) return null;

  const upNext = queue.slice(index + 1);
  const displayTime = scrubTime ?? currentTime;
  const progress = duration > 0 ? displayTime / duration : 0;
  const bars = waveform?.peaks?.length ? barsFromPeaks(waveform.peaks) : placeholderHeights(current.id);

  const specs = [
    detail?.sampleRate ? `${(detail.sampleRate / 1000).toFixed(1)} kHz` : null,
    detail?.bitrate ? `${Math.round(detail.bitrate / 1000)} kbps` : null,
    current.format ?? detail?.format ?? null,
  ].filter(Boolean);

  // A served-format badge appears only when the wire differs from the file (data saver, ADTS served as m4a).
  const servedFormat = servedLabel?.split(' · ')[0] ?? null;
  const sourceFormat = (current.format ?? detail?.format ?? '').toUpperCase();
  const showServed = servedLabel != null && (dataSaver || servedFormat !== sourceFormat);

  // Swipe down from the top of the sheet to close it. The sheet follows the finger, then either leaves or springs back.
  function dragStart(e: TouchEvent<HTMLDivElement>) {
    const el = sheetRef.current;
    if (!el || el.scrollTop > 0 || (e.target as HTMLElement).closest('input[type="range"]')) return;
    drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), active: false, dy: 0 };
  }
  function dragMove(e: TouchEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || !el) return;
    const dx = e.touches[0].clientX - d.x;
    const dy = e.touches[0].clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        drag.current = null;
        return;
      }
      d.active = true;
    }
    d.dy = dy;
    el.style.transition = 'none';
    el.style.transform = `translateY(${dy}px)`;
  }
  function dragEnd() {
    const d = drag.current;
    const el = sheetRef.current;
    drag.current = null;
    if (!d?.active || !el) return;
    const fast = d.dy / Math.max(Date.now() - d.t, 1) > 0.6;
    if (d.dy > 140 || fast) {
      // The exit keyframes start from this offset, so the sheet carries on from where the finger left it.
      el.style.setProperty('--drag', `${d.dy}px`);
      onCollapse();
      return;
    }
    el.style.transition = 'transform 320ms var(--ease-spring)';
    el.style.transform = '';
    window.setTimeout(() => {
      el.style.transition = '';
    }, 340);
  }

  return (
    <div
      ref={sheetRef}
      onTouchStart={dragStart}
      onTouchMove={dragMove}
      onTouchEnd={dragEnd}
      onTouchCancel={dragEnd}
      className="motion-slideup overscroll-contain fixed inset-0 z-50 flex flex-col overflow-y-auto bg-blue-950 text-white md:hidden"
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <button onClick={onCollapse} className="btn-ghost btn-sm h-9 w-9 !px-0" aria-label="Close now playing">
          <ChevronDownIcon className="h-5 w-5" />
        </button>
        {room ? (
          <Link
            to="/together"
            onClick={onCollapse}
            className={`font-display text-xs font-extrabold uppercase tracking-[0.22em] ${
              connection === 'live' ? 'text-orange-400' : 'text-blue-400'
            }`}
          >
            {connection === 'live' ? `Playing in room ${room.code}` : 'Reconnecting to the room'}
          </Link>
        ) : (
          <span className="font-display text-xs font-extrabold uppercase tracking-[0.22em] text-blue-400">
            Playing from library
          </span>
        )}
        <span className="w-9 text-right font-mono text-xs tabular-nums text-blue-400">
          <span key={index} className="motion-bump">{index + 1}</span>/{queue.length}
        </span>
      </div>

      <div className="px-5 pt-2">
        <div key={current.id} className="np-art relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-orange-600">
          <CoverArt kind="tracks" id={current.id} className="h-full w-full" alt="" />
          {current.format && (
            <span className="font-display absolute left-3 top-3 rounded-full bg-blue-950/70 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white">
              {current.format}
            </span>
          )}
        </div>
      </div>

      {/* Not uppercased: `text-transform` capitalises only the Latin half of mixed-script titles. */}
      <div key={current.id} className={`${swapClass} px-5 pt-5 text-center`}>
        <h2 className="font-display truncate text-2xl font-extrabold tracking-[0.01em] text-white">
          {current.title}
        </h2>
        <p className="mt-1 truncate text-sm text-blue-300">{current.artist ?? 'Unknown Artist'}</p>
      </div>

      <div className="flex gap-2.5 px-5 pt-5">
        <div className={pill(favoriteIds.has(current.id))}>
          <FavoriteButton trackId={current.id} isFavorited={favoriteIds.has(current.id)} className="p-1" />
        </div>
        <button onClick={() => setAddingToPlaylist(true)} className={pill(false)} aria-label="Add to playlist">
          <PlusIcon className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={() => startRadio(current)}
          disabled={inRoom}
          className={`${pill(false)} disabled:opacity-40`}
          aria-label={inRoom ? 'Start radio (off in a room)' : 'Start radio'}
        >
          <RadioIcon className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={toggleShuffle}
          disabled={queue.length < 2 || inRoom}
          className={`${pill(isShuffled)} disabled:opacity-40`}
          aria-pressed={isShuffled}
          aria-label={inRoom ? 'Shuffle (off in a room)' : 'Shuffle'}
        >
          <ShuffleIcon className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={cycleRepeat}
          disabled={inRoom}
          className={`${pill(repeat !== 'off')} disabled:opacity-40`}
          aria-label={inRoom ? 'Repeat (off in a room)' : `Repeat: ${repeat}`}
        >
          {repeat === 'one' ? <RepeatOneIcon className="h-4.5 w-4.5" /> : <RepeatIcon className="h-4.5 w-4.5" />}
        </button>
        <button onClick={stop} className={pill(false)} aria-label="Stop and clear the queue">
          <CloseIcon className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="relative px-5 pt-6 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-orange-500">
        <div className="flex h-14 items-center gap-[2px]" aria-hidden>
          {bars.map((h, i) => (
            <span
              key={i}
              className={`flex-1 rounded-[1px] ${i / WAVE_BARS < progress ? 'bg-orange-600' : 'bg-blue-800'}`}
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>

        {/* A native range over the bars, so drag, keyboard and screen readers work; the bars are decoration. */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(displayTime, duration || 1)}
          onChange={(e) => setScrubTime(Number(e.target.value))}
          onKeyUp={(e) => {
            seek(Number((e.target as HTMLInputElement).value));
            setScrubTime(null);
          }}
          disabled={!duration}
          className="absolute inset-x-5 top-6 h-14 w-[calc(100%-2.5rem)] cursor-pointer opacity-0"
          aria-label="Seek"
        />
      </div>

      <div className="flex justify-between px-5 pt-2 font-mono text-xs tabular-nums text-blue-400">
        <span>{formatClock(displayTime)}</span>
        {isBuffering && <span className="animate-pulse">Buffering…</span>}
        <span>{formatClock(duration)}</span>
      </div>

      <div className="flex items-center justify-center gap-8 px-5 pt-4">
        <button onClick={previous} className="btn-ghost btn-sm h-11 w-11 !px-0" aria-label="Previous track">
          <SkipBackIcon className="h-6 w-6" />
        </button>
        <button
          onClick={toggle}
          disabled={isLoading}
          className={`pulse-ring relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-orange-600 bg-blue-950 text-white transition-[background-color,transform] duration-200 ease-[var(--ease-spring)] hover:bg-blue-900 active:scale-90 disabled:opacity-60 ${isPlaying ? 'is-playing' : ''}`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <span className="text-sm leading-none">…</span>
          ) : (
            <span key={isPlaying ? 'pause' : 'play'} className="icon-swap">
              {isPlaying ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
            </span>
          )}
        </button>
        <button onClick={next} className="btn-ghost btn-sm h-11 w-11 !px-0" aria-label="Next track">
          <SkipForwardIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="flex items-center gap-3 px-5 pt-5">
        <button
          onClick={toggleMute}
          className="btn-ghost btn-sm h-9 w-9 shrink-0 !px-0"
          aria-label="Mute"
          aria-pressed={volume === 0}
        >
          {volume === 0 ? <VolumeMutedIcon className="h-5 w-5" /> : <VolumeIcon className="h-5 w-5" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer accent-orange-600"
          aria-label="Volume"
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-5 pt-4 text-center">
          {specs.length > 0 && (
            <span className="font-display rounded-full bg-blue-900 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.16em] text-blue-400">
              {specs.join(' · ')}
            </span>
          )}
          {showServed && (
            <span
              className={`font-display rounded-full px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.16em] ${
                dataSaver ? 'bg-orange-600 text-on-accent' : 'bg-blue-900 text-blue-400'
              }`}
            >
              {dataSaver ? `Streaming ${servedLabel}` : servedLabel}
            </span>
          )}
          <button
            onClick={() => void setDataSaver(!dataSaver)}
            className={`font-display flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.16em] ${
              dataSaver ? 'bg-orange-600 text-on-accent' : 'bg-blue-900 text-blue-400'
            }`}
            aria-pressed={dataSaver}
            aria-label="Data saver"
          >
            <DataSaverIcon className="h-4 w-4" />
            Saver
          </button>
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

      <div className="mt-6 border-t-2 border-blue-900">
        <div
          role="tablist"
          className="relative mx-5 grid grid-cols-2 border-b border-blue-800"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const next = tab === 'queue' ? 'related' : 'queue';
            setTab(next);
            document.getElementById(`np-tab-${next}`)?.focus();
          }}
        >
          {(['queue', 'related'] as const).map((id) => (
            <button
              key={id}
              id={`np-tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls="np-panel"
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              className={`font-display py-3 text-sm font-extrabold uppercase tracking-[0.16em] transition-colors ${
                tab === id ? 'text-white' : 'text-blue-400'
              }`}
            >
              {id === 'queue' ? 'Up next' : 'Related'}
            </button>
          ))}
          <span aria-hidden className="np-tab-underline" style={{ transform: `translateX(${tab === 'queue' ? 0 : 100}%)` }} />
        </div>
      </div>

      <div key={tab} id="np-panel" role="tabpanel" aria-labelledby={`np-tab-${tab}`} className="route-in">
        {tab === 'queue' ? (
          <>
            <div className="flex items-baseline justify-between px-5 pt-4">
              <span className="font-display text-sm font-extrabold uppercase tracking-[0.1em] text-blue-400">
                {upNext.length === 0
                  ? 'End of queue'
                  : `${upNext.length} ${upNext.length === 1 ? 'track' : 'tracks'} · ${formatClock(
                      totalQueueSeconds(upNext.map((t) => t.duration)),
                    )}`}
              </span>
            </div>

            <ul className="px-2 pb-8 pt-2">
              {upNext.map((track, i) => {
                const at = index + 1 + i;
                const isFolding = folding?.at === at && folding.id === track.id;
                return (
                  <li
                    key={`${track.id}-${at}`}
                    className={`np-row-wrap motion-rise ${isFolding ? 'np-row-collapse' : ''}`}
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    <div className="np-row-inner">
                      <div className="flex items-center rounded-xl transition-colors hover:bg-blue-900">
                        <button
                          onClick={() => goTo(at)}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                        >
                          <span className="w-5 shrink-0 text-center font-mono text-xs tabular-nums text-blue-400">
                            {at + 1}
                          </span>
                          <CoverArt kind="tracks" id={track.id} className="h-10 w-10 shrink-0 rounded-md" alt="" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-white">{track.title}</span>
                            <span className="block truncate text-xs text-blue-400">{track.artist ?? 'Unknown Artist'}</span>
                          </span>
                          {i === 0 && (
                            <span className="font-display shrink-0 border border-orange-600 px-1.5 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-accent-ink">
                              Next
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => fold(at)}
                          className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-blue-400 transition-[background-color,transform] duration-200 ease-[var(--ease-spring)] active:scale-90 active:bg-blue-800"
                          aria-label={`Remove ${track.title} from the queue`}
                        >
                          <CloseIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="px-4 pb-8 pt-4">
            <RelatedTab current={current} playQueue={player.playQueue} />
          </div>
        )}
      </div>
    </div>
  );
}
