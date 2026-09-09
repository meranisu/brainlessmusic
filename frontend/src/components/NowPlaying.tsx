import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import type { TrackDetail } from '../types/api';
import { CoverArt } from './CoverArt';
import { FavoriteButton, useFavoriteIds } from './FavoriteButton';
import {
  ChevronDownIcon,
  CloseIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from './icons';
import type { PlayerContextValue } from './PlayerBar';

const WAVE_BARS = 44;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Stand-in shape, shown while the real peaks are still being fetched or when
 * the server has none to give (an unreadable file, a missing duration).
 *
 * Derived from the track id so it stays put: a shape that reshuffled on every
 * render would read as broken rather than as pending.
 */
function placeholderHeights(trackId: number): number[] {
  return Array.from({ length: WAVE_BARS }, (_, i) => {
    const seed = Math.sin((trackId + 1) * (i + 7) * 12.9898) * 43758.5453;
    return 0.28 + (seed - Math.floor(seed)) * 0.72;
  });
}

/**
 * Reduces the server's peaks to the bars this scrubber draws, taking the
 * loudest sample in each span rather than the average — averaging pulls
 * everything toward the middle and flattens exactly the transients that make a
 * waveform recognisable.
 *
 * The server stores more buckets than any client draws, so this only ever
 * downsamples.
 */
function barsFromPeaks(peaks: number[]): number[] {
  const span = peaks.length / WAVE_BARS;
  return Array.from({ length: WAVE_BARS }, (_, i) => {
    const slice = peaks.slice(Math.floor(i * span), Math.max(Math.floor((i + 1) * span), Math.floor(i * span) + 1));
    // Floor at 0.06 so silence is still a visible line, not a gap in the bar.
    return Math.max(0.06, Math.max(...slice) / 255);
  });
}

function totalQueueSeconds(durations: (number | null | undefined)[]): number {
  return durations.reduce<number>((sum, d) => sum + (d ?? 0), 0);
}

function pill(active: boolean): string {
  return `flex h-11 flex-1 items-center justify-center rounded-2xl transition-colors ${
    active ? 'bg-orange-600 text-white' : 'bg-blue-900 text-blue-300 hover:bg-blue-800'
  }`;
}

/**
 * Full-screen Now Playing, phone only — the desktop bar keeps the screen it
 * already fits. Everything here is driven by the same player state as the bar;
 * this view is a second presentation of it, not a second player.
 */
export function NowPlaying({ player, onCollapse }: { player: PlayerContextValue; onCollapse: () => void }) {
  const {
    current,
    queue,
    index,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    repeat,
    isShuffled,
    toggle,
    next,
    previous,
    seek,
    goTo,
    cycleRepeat,
    toggleShuffle,
    stop,
  } = player;

  const favoriteIds = useFavoriteIds();

  // The queue only carries what it needs to play; sample rate and bitrate live
  // on the full record. Same query key the bar invalidates after a scrobble.
  const { data: detail } = useQuery({
    queryKey: ['track', current?.id],
    queryFn: () => apiClient.get<TrackDetail>(`/tracks/${current!.id}`),
    enabled: current != null,
    staleTime: 60_000,
  });

  // Peaks are computed from the file on the server's first look at a track and
  // cached on the row from then on, so this is slow once and instant after.
  // A track that can't be analysed 404s; that's a placeholder, not an error
  // worth showing anyone.
  const { data: waveform } = useQuery({
    queryKey: ['waveform', current?.id],
    queryFn: () => apiClient.get<{ peaks: number[] }>(`/tracks/${current!.id}/waveform`),
    enabled: current != null,
    staleTime: Infinity,
    retry: false,
  });

  if (!current) return null;

  const upNext = queue.slice(index + 1);
  const progress = duration > 0 ? currentTime / duration : 0;
  const bars = waveform?.peaks?.length ? barsFromPeaks(waveform.peaks) : placeholderHeights(current.id);

  const specs = [
    detail?.sampleRate ? `${(detail.sampleRate / 1000).toFixed(1)} kHz` : null,
    detail?.bitrate ? `${Math.round(detail.bitrate / 1000)} kbps` : null,
    current.format ?? detail?.format ?? null,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-blue-950 text-white md:hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <button onClick={onCollapse} className="btn-ghost btn-sm h-9 w-9 !px-0" aria-label="Close now playing">
          <ChevronDownIcon className="h-5 w-5" />
        </button>
        <span className="font-display text-xs font-extrabold uppercase tracking-[0.22em] text-blue-400">
          Playing from library
        </span>
        <span className="w-9 text-right font-mono text-xs tabular-nums text-blue-400">
          {index + 1}/{queue.length}
        </span>
      </div>

      <div className="px-5 pt-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border-2 border-orange-600">
          <CoverArt kind="tracks" id={current.id} className="h-full w-full" alt="" />
          {current.format && (
            <span className="font-display absolute left-3 top-3 rounded-full bg-blue-950/70 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-white">
              {current.format}
            </span>
          )}
        </div>
      </div>

      {/* Condensed and heavy, as the design asks, but not uppercased: a third
          of this library has mixed-script titles, and `text-transform` would
          capitalise only their Latin half — "WORTH LIVING ~ FROM 智代アフター". */}
      <div className="px-5 pt-5 text-center">
        <h2 className="font-display truncate text-2xl font-extrabold tracking-[0.01em] text-white">
          {current.title}
        </h2>
        <p className="mt-1 truncate text-sm text-blue-300">{current.artist ?? 'Unknown Artist'}</p>
      </div>

      <div className="flex gap-2.5 px-5 pt-5">
        <div className={pill(favoriteIds.has(current.id))}>
          <FavoriteButton trackId={current.id} isFavorited={favoriteIds.has(current.id)} className="p-1" />
        </div>
        <button
          onClick={toggleShuffle}
          disabled={queue.length < 2}
          className={`${pill(isShuffled)} disabled:opacity-40`}
          aria-pressed={isShuffled}
          aria-label="Shuffle"
        >
          <ShuffleIcon className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={cycleRepeat}
          className={pill(repeat !== 'off')}
          aria-label={`Repeat: ${repeat}`}
        >
          {repeat === 'one' ? <RepeatOneIcon className="h-4.5 w-4.5" /> : <RepeatIcon className="h-4.5 w-4.5" />}
        </button>
        <button onClick={stop} className={pill(false)} aria-label="Stop and clear the queue">
          <CloseIcon className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="relative px-5 pt-6">
        <div className="flex h-14 items-center gap-[2px]" aria-hidden>
          {bars.map((h, i) => (
            <span
              key={i}
              className={`flex-1 rounded-[1px] ${i / WAVE_BARS < progress ? 'bg-orange-600' : 'bg-blue-800'}`}
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>

        {/* The real control: a native range on top of the bars, so drag,
            keyboard and screen readers all work without reimplementing any of
            it. The bars are decoration painted underneath. */}
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(currentTime, duration || 1)}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!duration}
          className="absolute inset-x-5 top-6 h-14 w-[calc(100%-2.5rem)] cursor-pointer opacity-0"
          aria-label="Seek"
        />
      </div>

      <div className="flex justify-between px-5 pt-2 font-mono text-xs tabular-nums text-blue-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="flex items-center justify-center gap-8 px-5 pt-4">
        <button onClick={previous} className="btn-ghost btn-sm h-11 w-11 !px-0" aria-label="Previous track">
          <SkipBackIcon className="h-6 w-6" />
        </button>
        <button
          onClick={toggle}
          disabled={isLoading}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-orange-600 bg-blue-950 text-white transition-colors hover:bg-blue-900 disabled:opacity-60"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <span className="text-sm leading-none">…</span>
          ) : isPlaying ? (
            <PauseIcon className="h-6 w-6" />
          ) : (
            <PlayIcon className="h-6 w-6" />
          )}
        </button>
        <button onClick={next} className="btn-ghost btn-sm h-11 w-11 !px-0" aria-label="Next track">
          <SkipForwardIcon className="h-6 w-6" />
        </button>
      </div>

      {specs.length > 0 && (
        <div className="px-5 pt-4 text-center">
          <span className="font-display rounded-full bg-blue-900 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.16em] text-blue-400">
            {specs.join(' · ')}
          </span>
        </div>
      )}

      <div className="mt-6 border-t-2 border-blue-900 px-5 pt-5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-base font-extrabold uppercase tracking-[0.14em] text-white">Up next</h3>
          <span className="font-display text-sm font-extrabold uppercase tracking-[0.1em] text-blue-400">
            {upNext.length === 0
              ? 'End of queue'
              : `${upNext.length} ${upNext.length === 1 ? 'track' : 'tracks'} · ${formatTime(
                  totalQueueSeconds(upNext.map((t) => t.duration)),
                )}`}
          </span>
        </div>
      </div>

      <ul className="px-2 pb-8">
        {upNext.map((track, i) => (
          <li key={`${track.id}-${i}`}>
            <button
              onClick={() => goTo(index + 1 + i)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-blue-900"
            >
              <span className="w-5 shrink-0 text-center font-mono text-xs tabular-nums text-blue-400">
                {index + 2 + i}
              </span>
              <CoverArt kind="tracks" id={track.id} className="h-10 w-10 shrink-0 rounded-md" alt="" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{track.title}</span>
                <span className="block truncate text-xs text-blue-400">{track.artist ?? 'Unknown Artist'}</span>
              </span>
              {i === 0 && (
                <span className="font-display shrink-0 border border-orange-600 px-1.5 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-orange-500">
                  Next
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
