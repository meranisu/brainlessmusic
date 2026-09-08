import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiClient, buildStreamUrl } from '../lib/apiClient';
import type { TrackSummary } from '../types/api';
import { useToast } from './ToastProvider';

export type QueueTrack = Pick<TrackSummary, 'id' | 'title' | 'artist' | 'duration'>;

export type RepeatMode = 'off' | 'all' | 'one';

/** Treat "previous" within this many seconds as "restart the track" — the
 *  convention every music player uses. */
const RESTART_THRESHOLD_SECONDS = 3;

const SEEK_STEP_SECONDS = 5;

interface PlayerContextValue {
  queue: QueueTrack[];
  index: number;
  current: QueueTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  repeat: RepeatMode;
  isShuffled: boolean;
  playQueue: (tracks: QueueTrack[], startIndex: number) => void;
  playTrack: (track: QueueTrack) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [isShuffled, setIsShuffled] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The pre-shuffle order, so turning shuffle off restores it rather than
  // leaving the queue permanently scrambled.
  const originalQueueRef = useRef<QueueTrack[] | null>(null);
  const { showToast } = useToast();

  const current = queue[index] ?? null;

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  async function load(tracks: QueueTrack[], at: number, autoplay = true) {
    const audio = audioRef.current;
    const track = tracks[at];
    if (!audio || !track) return;

    setIsLoading(true);
    setCurrentTime(0);
    // Fall back to the duration the scanner recorded — some Ogg/Opus streams
    // don't report a usable duration until fully buffered.
    setDuration(track.duration ?? 0);

    try {
      audio.src = await buildStreamUrl(track.id);
      if (autoplay) await audio.play();
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not play ${track.title}`, 'error');
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }

  function playQueue(tracks: QueueTrack[], startIndex: number) {
    if (tracks.length === 0) return;
    const at = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    originalQueueRef.current = tracks;
    setIsShuffled(false);
    setQueue(tracks);
    setIndex(at);
    void load(tracks, at);
  }

  function playTrack(track: QueueTrack) {
    playQueue([track], 0);
  }

  function goTo(at: number) {
    if (at < 0 || at >= queue.length) return;
    setIndex(at);
    void load(queue, at);
  }

  function next() {
    if (index < queue.length - 1) return goTo(index + 1);
    if (repeat === 'all') return goTo(0);
  }

  function previous() {
    const audio = audioRef.current;
    if (audio && audio.currentTime > RESTART_THRESHOLD_SECONDS) {
      audio.currentTime = 0;
      return;
    }
    if (index > 0) return goTo(index - 1);
    if (audio) audio.currentTime = 0;
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const max = duration || audio.duration || 0;
    audio.currentTime = Math.min(Math.max(seconds, 0), max);
    setCurrentTime(audio.currentTime);
  }

  function cycleRepeat() {
    setRepeat((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'));
  }

  async function toggleShuffle() {
    if (queue.length < 2) return;

    if (isShuffled) {
      const restored = originalQueueRef.current ?? queue;
      const at = current ? restored.findIndex((t) => t.id === current.id) : 0;
      setQueue(restored);
      setIndex(at < 0 ? 0 : at);
      setIsShuffled(false);
      return;
    }

    try {
      // Server-side smart shuffle — it avoids putting the same artist
      // back-to-back, which a plain client-side sort can't do without the
      // artist ids.
      const { tracks } = await apiClient.post<{ tracks: TrackSummary[] }>('/shuffle', {
        trackIds: queue.map((t) => t.id),
      });

      // Keep whatever is playing exactly where it is — reordering the queue
      // shouldn't interrupt the current track.
      const rest = current ? tracks.filter((t) => t.id !== current.id) : tracks;
      const reordered = current ? [current, ...rest] : rest;

      setQueue(reordered);
      setIndex(0);
      setIsShuffled(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Shuffle failed', 'error');
    }
  }

  function stop() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load(); // drop the in-flight range request rather than buffering on
    }
    originalQueueRef.current = null;
    setQueue([]);
    setIndex(0);
    setIsPlaying(false);
    setIsShuffled(false);
    setCurrentTime(0);
    setDuration(0);
  }

  // Re-bound whenever the queue position or repeat mode changes, so the
  // handler always sees current values instead of the ones captured at mount.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onEnded() {
      if (repeat === 'one') {
        void load(queue, index);
        return;
      }
      if (index < queue.length - 1) {
        goTo(index + 1);
        return;
      }
      if (repeat === 'all' && queue.length > 0) {
        goTo(0);
        return;
      }
      setIsPlaying(false);
    }

    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index, repeat]);

  // Keyboard transport. Ignored while typing, so the library search box and
  // the tag editor keep working normally.
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (!current) return;

      const target = ev.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      switch (ev.key) {
        case ' ':
          ev.preventDefault();
          toggle();
          break;
        case 'ArrowLeft':
          ev.preventDefault();
          seek(currentTime - SEEK_STEP_SECONDS);
          break;
        case 'ArrowRight':
          ev.preventDefault();
          seek(currentTime + SEEK_STEP_SECONDS);
          break;
        case 'n':
          next();
          break;
        case 'p':
          previous();
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, currentTime, queue, index, repeat, duration]);

  const effectiveDuration = duration || current?.duration || 0;

  return (
    <PlayerContext.Provider
      value={{
        queue,
        index,
        current,
        isPlaying,
        isLoading,
        currentTime,
        duration: effectiveDuration,
        repeat,
        isShuffled,
        playQueue,
        playTrack,
        toggle,
        next,
        previous,
        seek,
        cycleRepeat,
        toggleShuffle,
        stop,
      }}
    >
      {children}

      {current && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-800 bg-blue-900">
          <div className="page-shell flex items-center gap-4 px-6 py-3">
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={previous}
                className="btn-ghost btn-sm h-8 w-8 !px-0"
                aria-label="Previous track"
                title="Previous (P)"
              >
                ⏮
              </button>
              <button
                onClick={toggle}
                disabled={isLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-600 text-blue-950 transition-colors hover:bg-orange-500 disabled:opacity-60"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title="Play/pause (Space)"
              >
                {isLoading ? '…' : isPlaying ? '❚❚' : '▶'}
              </button>
              <button
                onClick={next}
                className="btn-ghost btn-sm h-8 w-8 !px-0"
                aria-label="Next track"
                title="Next (N)"
              >
                ⏭
              </button>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium text-white">{current.title}</span>
                <span className="truncate text-xs text-blue-300">{current.artist ?? 'Unknown Artist'}</span>
                {queue.length > 1 && (
                  <span className="ml-auto shrink-0 font-mono text-xs text-blue-400">
                    {index + 1}/{queue.length}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-blue-300">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={effectiveDuration || 1}
                  step={0.1}
                  value={isScrubbing ? currentTime : Math.min(currentTime, effectiveDuration || 1)}
                  onChange={(e) => setCurrentTime(Number(e.target.value))}
                  onMouseDown={() => setIsScrubbing(true)}
                  onTouchStart={() => setIsScrubbing(true)}
                  onMouseUp={(e) => {
                    setIsScrubbing(false);
                    seek(Number((e.target as HTMLInputElement).value));
                  }}
                  onTouchEnd={(e) => {
                    setIsScrubbing(false);
                    seek(Number((e.target as HTMLInputElement).value));
                  }}
                  onKeyUp={(e) => seek(Number((e.target as HTMLInputElement).value))}
                  disabled={!effectiveDuration}
                  className="h-1 w-full cursor-pointer accent-orange-600 disabled:cursor-not-allowed"
                  aria-label="Seek"
                />
                <span className="w-9 shrink-0 font-mono text-xs tabular-nums text-blue-300">
                  {formatTime(effectiveDuration)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={toggleShuffle}
                disabled={queue.length < 2}
                className={`btn-ghost btn-sm ${isShuffled ? 'text-orange-500' : ''}`}
                aria-pressed={isShuffled}
                title="Smart shuffle — avoids the same artist back-to-back"
              >
                Shuffle
              </button>
              <button
                onClick={cycleRepeat}
                className={`btn-ghost btn-sm ${repeat !== 'off' ? 'text-orange-500' : ''}`}
                title={`Repeat: ${repeat}`}
              >
                {repeat === 'one' ? 'Repeat 1' : 'Repeat'}
              </button>
              <button onClick={stop} className="btn-ghost btn-sm" aria-label="Close player">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
