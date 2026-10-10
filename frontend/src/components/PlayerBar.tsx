import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useIsPhone } from '../hooks/useIsPhone';
import { apiClient, buildCoverUrl, buildStreamUrl, prepareTrack, reportPlaybackFailure } from '../lib/apiClient';
import {
  describeMediaError,
  describeServed,
  loadDataSaverPreference,
  probeServedStream,
  saveDataSaverPreference,
  type ServedStream,
} from '../lib/streamQuality';
import { CoverArt } from './CoverArt';
import { FavoriteButton, useFavoriteIds } from './FavoriteButton';
import {
  CloseIcon,
  DataSaverIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  VolumeMutedIcon,
} from './icons';
import { NowPlaying } from './NowPlaying';
import type { PlaybackState, TrackSummary } from '../types/api';
import { useToast } from './ToastProvider';

export type QueueTrack = Pick<TrackSummary, 'id' | 'title' | 'artist' | 'duration'> &
  Partial<Pick<TrackSummary, 'format'>>;

export type RepeatMode = 'off' | 'all' | 'one';

/** "Previous" within this many seconds restarts the track. */
const RESTART_THRESHOLD_SECONDS = 3;

const SEEK_STEP_SECONDS = 5;

/** A play counts at half the track or four minutes, whichever is first (Last.fm's rule). */
const SCROBBLE_CAP_SECONDS = 240;

/** A jump bigger than this is a seek, not listening. */
const MAX_PLAYBACK_DELTA_SECONDS = 2;

/** How often the position is pushed while playing. */
const SAVE_INTERVAL_MS = 10_000;

/** How long a track has to stay current before the next one is converted ahead of time. */
const PREPARE_NEXT_DELAY_MS = 15_000;

interface PlayProgress {
  trackId: number;
  listenedMs: number;
  lastTime: number;
  thresholdMs: number;
  scrobbled: boolean;
}

/** A stalled source fires neither `loadedmetadata` nor `error`; give up after this. */
const METADATA_TIMEOUT_MS = 15_000;

interface StreamFailureInfo {
  /** The native `MediaError` code (1-4), when the failure raised one. */
  mediaErrorCode?: number;
  /** `Content-Type` the server actually sent, read back separately since the
   *  `<audio>` element itself exposes no response headers at all. */
  contentType?: string;
  /** Rendered for the toast, e.g. " (format not supported; served as audio/ogg)". */
  detail: string;
}

const EMPTY_FAILURE_INFO: StreamFailureInfo = { detail: '' };

/** A load failure with diagnostics, so "it just skips" is debuggable and a decode error can retry through compat once. */
class StreamLoadError extends Error {
  readonly info: StreamFailureInfo;
  constructor(message: string, info: StreamFailureInfo = EMPTY_FAILURE_INFO) {
    super(message);
    this.info = info;
  }
}

/** MediaError codes worth one retry through the compat transcode; network and abort errors would just repeat. */
function isRetryableMediaError(code: number | undefined): boolean {
  return code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || code === MediaError.MEDIA_ERR_DECODE;
}

/** Failure diagnostics: the `MediaError` plus a tiny ranged request that reads back the served `Content-Type`. */
async function describeStreamFailure(audio: HTMLAudioElement, url: string): Promise<StreamFailureInfo> {
  const parts: string[] = [];
  const mediaErrorCode = audio.error?.code;
  const reason = describeMediaError(audio.error);
  if (reason) parts.push(reason);

  let contentType: string | undefined;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3000);
    const served = await probeServedStream(url, controller.signal).finally(() => window.clearTimeout(timer));
    if (served) {
      contentType = served.mimeType;
      parts.push(`served as ${served.mimeType}`);
    }
  } catch {
    // Best effort; the failure reports with what was gathered.
  }

  return { mediaErrorCode, contentType, detail: parts.length > 0 ? ` (${parts.join('; ')})` : '' };
}

/** Resolves once a new source can be seeked; rejects on error or timeout rather than hang on "loading". */
function waitForMetadata(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('error', onFailed);
      window.clearTimeout(timer);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onFailed = () => {
      cleanup();
      const src = audio.currentSrc;
      void describeStreamFailure(audio, src).then((info) => {
        reject(new StreamLoadError('The stream could not be loaded', info));
      });
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new StreamLoadError('The stream timed out'));
    }, METADATA_TIMEOUT_MS);
    audio.addEventListener('loadedmetadata', onReady);
    audio.addEventListener('error', onFailed);
  });
}

function scrobbleThresholdMs(durationSeconds: number): number {
  // No duration yet: use the cap until `loadedmetadata` tightens it.
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return SCROBBLE_CAP_SECONDS * 1000;
  return Math.min(durationSeconds / 2, SCROBBLE_CAP_SECONDS) * 1000;
}

const VOLUME_STORAGE_KEY = 'brainlessmusic.volume';

/** Full volume (1) by default, like every other player. */
function loadVolumePreference(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return 1;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 1;
  } catch {
    return 1;
  }
}

function saveVolumePreference(volume: number): void {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  } catch {
    // Same trade-off as `saveDataSaverPreference`: applies for this session,
    // just won't survive a reload. Not worth interrupting playback over.
  }
}

export interface PlayerContextValue {
  queue: QueueTrack[];
  index: number;
  current: QueueTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** Stalled mid-track and expected to recover; unlike `isLoading`, the transport stays enabled. */
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  repeat: RepeatMode;
  isShuffled: boolean;
  dataSaver: boolean;
  /** 0 to 1. Muted is just `volume === 0`. */
  volume: number;
  /** What the server actually sent, e.g. `OPUS · 64k`. Null until probed. */
  servedLabel: string | null;
  playQueue: (tracks: QueueTrack[], startIndex: number) => void;
  playTrack: (track: QueueTrack) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  seek: (seconds: number) => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  setDataSaver: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
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
  const [dataSaver, setDataSaverState] = useState(loadDataSaverPreference);
  const [volume, setVolumeState] = useState(loadVolumePreference);
  // The volume just before muting, restored on unmute.
  const preMuteVolumeRef = useRef(volume || 1);
  const [served, setServed] = useState<ServedStream | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  // A mid-track stall (`waiting`), shown without disabling the transport.
  const [isBuffering, setIsBuffering] = useState(false);
  // Phone only: the bar collapses to a strip and this opens the full view.
  const [isExpanded, setIsExpanded] = useState(false);
  const isPhone = useIsPhone();
  // The provider wraps the whole router so playback survives navigation, so the bar hides itself on the title and
  // account-select screens, where a leftover queue would peek out from under their cards.
  const { pathname } = useLocation();
  const onAttractScreen = pathname.startsWith('/enter');
  // Derived, not stored: widening past `md` with the sheet open would otherwise strand the user with no controls.
  const isSheetOpen = isExpanded && isPhone;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The pre-shuffle order, so turning shuffle off restores it rather than
  // leaving the queue permanently scrambled.
  const originalQueueRef = useRef<QueueTrack[] | null>(null);
  // In a ref so the long-lived audio listeners see live values.
  const progressRef = useRef<PlayProgress | null>(null);
  // True while a quality swap resets `src`, so the scrubber doesn't flick to 0 before the seek lands.
  const swappingRef = useRef(false);
  // Mirrors `isScrubbing` for the mount-time `timeupdate` listener, which would otherwise fight the drag.
  const scrubbingRef = useRef(false);
  // Mirrors `isPlaying` for the mount-time error listener.
  const isPlayingRef = useRef(false);
  // Set on `playing`. Earlier errors belong to `load()`; reconnect only handles a source that worked and broke.
  const hasStartedRef = useRef(false);
  // Latest `load()` wins: an abandoned call checks this before writing state or toasting.
  const loadTokenRef = useRef(0);
  // Back-to-back load failures, so auto-skip stops after one pass over a broken queue.
  const consecutiveLoadFailuresRef = useRef(0);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Read by `scrobble`, which runs from listeners bound once on mount and
  // would otherwise see the user as it was on the first render.
  const isGuestRef = useRef(false);
  isGuestRef.current = Boolean(user?.isGuest);
  const { showToast } = useToast();
  const favoriteIds = useFavoriteIds();

  const current = queue[index] ?? null;

  useEffect(() => {
    scrubbingRef.current = isScrubbing;
  }, [isScrubbing]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const audio = new Audio();
    // Buffer as much as the browser allows while foregrounded.
    audio.preload = 'auto';
    // Read fresh: this effect runs once, at mount.
    audio.volume = loadVolumePreference();
    audioRef.current = audio;

    const onTime = () => {
      // Mid-swap the clock is briefly 0 and means nothing: not a position to
      // show, and not time anybody listened to.
      if (swappingRef.current) return;
      // Audio plays on under a drag, so it still counts as listened.
      recordListenedTime(audio.currentTime);
      if (!scrubbingRef.current) setCurrentTime(audio.currentTime);
    };
    const onMeta = () => {
      const known = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(known);
      // The scanner's duration can be missing or wrong; once the browser has
      // decoded the header it knows better, so re-derive the threshold.
      if (progressRef.current && known > 0) {
        progressRef.current.thresholdMs = scrobbleThresholdMs(known);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => {
      hasStartedRef.current = true;
      consecutiveLoadFailuresRef.current = 0;
      setIsBuffering(false);
    };
    // A source that was playing and broke: dropped connection, decode error, or a lapsed `?token=` on seek.
    // `load()` and the quality swap handle their own errors.
    const onError = () => {
      if (swappingRef.current || !hasStartedRef.current) return;
      hasStartedRef.current = false;

      const { queue: tracks, index: at } = stateRef.current;
      const track = tracks[at];
      if (!track) return;

      void reconnect(track, progressRef.current?.lastTime ?? 0, isPlayingRef.current);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error', onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scrobble(trackId: number, msPlayed: number) {
    // Guest plays aren't counted (A37); the route would answer 403.
    if (isGuestRef.current) return;
    try {
      await apiClient.post(`/tracks/${trackId}/scrobble`, { msPlayed });
      // Play counts show up in the library table and the track drawer, so let
      // whatever is on screen pick up the new number.
      void queryClient.invalidateQueries({ queryKey: ['tracks'] });
      void queryClient.invalidateQueries({ queryKey: ['track', trackId] });
    } catch {
      // A missed scrobble costs a statistic; never interrupt playback for it.
    }
  }

  function recordListenedTime(positionSeconds: number) {
    const progress = progressRef.current;
    if (!progress) return;

    const delta = positionSeconds - progress.lastTime;
    progress.lastTime = positionSeconds;
    if (delta > 0 && delta <= MAX_PLAYBACK_DELTA_SECONDS) {
      progress.listenedMs += delta * 1000;
    }

    if (!progress.scrobbled && progress.listenedMs >= progress.thresholdMs) {
      progress.scrobbled = true; // set before the request, so a slow response can't double-count
      void scrobble(progress.trackId, Math.round(progress.listenedMs));
    }
  }

  /**
   * One silent attempt to resume a stream that died mid-track: reassign `src` (fresh media token) and reseek, keeping
   * `progressRef` so the same listen continues. Failure here is reported.
   */
  async function reconnect(track: QueueTrack, resumeAt: number, wasPlaying: boolean) {
    const audio = audioRef.current;
    if (!audio) return;

    async function attempt(forceCompat: boolean): Promise<void> {
      audio!.src = await buildStreamUrl(track.id, dataSaver ? 'low' : undefined, forceCompat);
      await waitForMetadata(audio!);
      audio!.currentTime = resumeAt;
      if (progressRef.current) progressRef.current.lastTime = resumeAt;
      setCurrentTime(resumeAt);
    }

    swappingRef.current = true;
    try {
      try {
        await attempt(false);
      } catch (err) {
        // One silent retry through the compat transcode (see `load()`).
        if (err instanceof StreamLoadError && isRetryableMediaError(err.info.mediaErrorCode)) {
          await attempt(true);
        } else {
          throw err;
        }
      }
      swappingRef.current = false;
      if (wasPlaying) await audio.play();
    } catch (err) {
      swappingRef.current = false;
      setIsPlaying(false);
      const info = err instanceof StreamLoadError ? err.info : EMPTY_FAILURE_INFO;
      reportPlaybackFailure(track.id, {
        mediaErrorCode: info.mediaErrorCode,
        contentType: info.contentType,
        detail: err instanceof Error ? err.message : String(err),
      });
      showToast(`Playback stopped. Couldn't reconnect to "${track.title}"${info.detail}`, 'error');
    }
  }

  async function load(tracks: QueueTrack[], at: number, autoplay = true, resumeAt = 0) {
    const audio = audioRef.current;
    const track = tracks[at];
    if (!audio || !track) return;

    // Latest wins: re-checked after every await so an abandoned call never overwrites the newer one.
    const token = ++loadTokenRef.current;
    hasStartedRef.current = false;

    setIsLoading(true);
    setCurrentTime(0);
    // A fresh play, including repeat-one, which scrobbles again.
    progressRef.current = {
      trackId: track.id,
      listenedMs: 0,
      lastTime: 0,
      thresholdMs: scrobbleThresholdMs(track.duration ?? 0),
      scrobbled: false,
    };
    // The scanned duration, since some Ogg/Opus streams report none until fully buffered.
    setDuration(track.duration ?? 0);

    // `play()` rejects on an undecodable source; wrapped so that path gets `StreamLoadError` diagnostics too.
    async function attempt(forceCompat: boolean): Promise<void> {
      const url = await buildStreamUrl(track.id, dataSaver ? 'low' : undefined, forceCompat);
      if (token !== loadTokenRef.current) return;
      audio!.src = url;
      if (resumeAt > 0) {
        // Nothing can be seeked until the browser knows how long the track is.
        await waitForMetadata(audio!);
        if (token !== loadTokenRef.current) return;
        audio!.currentTime = resumeAt;
        // Restoring isn't listening: anchor here so the jump from 0 isn't counted.
        if (progressRef.current) progressRef.current.lastTime = resumeAt;
        setCurrentTime(resumeAt);
      }
      if (autoplay) {
        try {
          await audio!.play();
        } catch (err) {
          throw new StreamLoadError(
            err instanceof Error ? err.message : 'Playback failed',
            await describeStreamFailure(audio!, url),
          );
        }
      }
    }

    try {
      try {
        await attempt(false);
      } catch (err) {
        if (token !== loadTokenRef.current) return;
        // One silent retry through the compat transcode before skipping, for any format (see `variantFor`).
        if (err instanceof StreamLoadError && isRetryableMediaError(err.info.mediaErrorCode)) {
          await attempt(true);
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (token !== loadTokenRef.current) return; // a newer load already reports for itself

      const info = err instanceof StreamLoadError ? err.info : EMPTY_FAILURE_INFO;
      reportPlaybackFailure(track.id, {
        mediaErrorCode: info.mediaErrorCode,
        contentType: info.contentType,
        detail: err instanceof Error ? err.message : String(err),
      });

      // Skip past a bad file like `next()` would, capped at one pass over the queue.
      const nextIndex = at < tracks.length - 1 ? at + 1 : repeat === 'all' && tracks.length > 0 ? 0 : -1;
      consecutiveLoadFailuresRef.current += 1;
      const failureCount = consecutiveLoadFailuresRef.current;

      if (nextIndex >= 0 && failureCount <= tracks.length) {
        // Failures arrive in quick succession; after two, more toasts add nothing.
        if (failureCount <= 2) {
          showToast(`Skipped "${track.title}": it could not be played${info.detail}`, 'error');
        }
        goTo(nextIndex);
        return;
      }

      consecutiveLoadFailuresRef.current = 0;
      showToast(
        tracks.length > 1
          ? `Couldn't play any track in the queue (${failureCount} skipped)${info.detail}`
          : (err instanceof Error ? `${err.message}${info.detail}` : `Could not play ${track.title}`),
        'error',
      );
      setIsPlaying(false);
    } finally {
      if (token === loadTokenRef.current) setIsLoading(false);
    }
  }

  /**
   * Data saver applies to the playing track. The converted copy is warmed first (5.7 s cold for a 172 s track) while
   * the original keeps playing, so the swap itself is instant.
   */
  const swapRef = useRef<{ token: number; abort: AbortController | null }>({ token: 0, abort: null });

  async function setDataSaver(enabled: boolean) {
    setDataSaverState(enabled);
    saveDataSaverPreference(enabled);

    const audio = audioRef.current;
    const track = current;
    if (!audio || !track || !audio.src) return;

    // A second press supersedes the first: abort its warm-up and ignore it.
    swapRef.current.abort?.abort();
    const controller = new AbortController();
    const token = swapRef.current.token + 1;
    swapRef.current = { token, abort: controller };

    // Set once `src` is touched, so a failure can restore the working source.
    let previousSrc: string | null = null;
    let resumeAt = 0;
    let wasPlaying = false;
    let reassigned = false;

    setIsLoading(true);
    try {
      const url = await buildStreamUrl(track.id, enabled ? 'low' : undefined);

      // Doubles as the readout probe and as the "is it ready yet" wait: the
      // response does not arrive until the file exists.
      const served = await probeServedStream(url, controller.signal);
      if (token !== swapRef.current.token) return;
      if (!served) throw new Error('The converted copy could not be prepared');

      // Read after the wait: the track kept playing.
      resumeAt = audio.currentTime;
      wasPlaying = !audio.paused;
      previousSrc = audio.src;

      swappingRef.current = true;
      reassigned = true;
      audio.src = url;
      await waitForMetadata(audio);
      audio.currentTime = resumeAt;
      // The same listen continues; re-anchor so the jump to `resumeAt` isn't counted.
      if (progressRef.current) progressRef.current.lastTime = resumeAt;
      setCurrentTime(resumeAt);
      swappingRef.current = false;
      if (wasPlaying) await audio.play();
    } catch (err) {
      if (token !== swapRef.current.token) {
        swappingRef.current = false;
        return; // superseded, not failed
      }
      // An abort (a newer press, or the page leaving) isn't a refusal, so the preference stays.
      if (err instanceof DOMException && err.name === 'AbortError') {
        swappingRef.current = false;
        return;
      }

      // Revert the toggle, since the readout is built from it.
      setDataSaverState(!enabled);
      saveDataSaverPreference(!enabled);

      // `src` untouched means the original still plays.
      let restored = !reassigned;
      if (reassigned && previousSrc) {
        try {
          audio.src = previousSrc;
          await waitForMetadata(audio);
          audio.currentTime = resumeAt;
          if (progressRef.current) progressRef.current.lastTime = resumeAt;
          setCurrentTime(resumeAt);
          if (wasPlaying) await audio.play();
          restored = true;
        } catch {
          restored = false;
        }
      }
      swappingRef.current = false;

      if (restored) {
        showToast('Could not switch quality. Still playing the original.', 'error');
      } else {
        // The restore failed too, so don't claim playback continued.
        setIsPlaying(false);
        showToast("Playback stopped. Couldn't switch quality or recover the original stream.", 'error');
      }
    } finally {
      if (token === swapRef.current.token) setIsLoading(false);
    }
  }

  /** Set on the element directly; a dragged slider fires many times a second. */
  function setVolume(next: number) {
    const clamped = Math.min(Math.max(next, 0), 1);
    setVolumeState(clamped);
    saveVolumePreference(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    if (clamped > 0) preMuteVolumeRef.current = clamped;
  }

  function toggleMute() {
    setVolume(volume > 0 ? 0 : preMuteVolumeRef.current);
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
      // Same reasoning as `seek()`: keep the reconnect anchor from going
      // stale the instant this jump happens.
      if (progressRef.current) progressRef.current.lastTime = 0;
      return;
    }
    if (index > 0) return goTo(index - 1);
    if (audio) {
      audio.currentTime = 0;
      if (progressRef.current) progressRef.current.lastTime = 0;
    }
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      // A broken `src` after a failed reconnect was already reported once.
      void audio.play().catch(() => {});
    } else audio.pause();
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const max = duration || audio.duration || 0;
    const target = Math.min(Math.max(seconds, 0), max);
    audio.currentTime = target;
    // Keep the reconnect point current until the next `timeupdate`, or an error now resumes from before the seek.
    if (progressRef.current) progressRef.current.lastTime = target;
    setCurrentTime(target);
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
      // Server-side, because avoiding back-to-back artists needs artist ids.
      const { tracks } = await apiClient.post<{ tracks: TrackSummary[] }>('/shuffle', {
        trackIds: queue.map((t) => t.id),
      });

      // The playing track stays put.
      const rest = current ? tracks.filter((t) => t.id !== current.id) : tracks;
      const reordered = current ? [current, ...rest] : rest;

      setQueue(reordered);
      setIndex(0);
      setIsShuffled(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Shuffle failed', 'error');
    }
  }

  // Stable identity so the sign-out effect below can depend on the session
  // alone; every value it touches is a setter or a ref.
  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load(); // drop the in-flight range request rather than buffering on
    }
    originalQueueRef.current = null;
    progressRef.current = null;
    setQueue([]);
    setIndex(0);
    setIsPlaying(false);
    setIsShuffled(false);
    setCurrentTime(0);
    setDuration(0);
    setIsExpanded(false);
  }, []);

  /** Closing the player means "I'm done", so the saved position goes too. Separate from `stop`: logout must keep it. */
  const stopAndForget = useCallback(() => {
    stop();
    void apiClient.delete('/me/playback-state').catch(() => {
      // The queue is already gone locally; a stale row will be overwritten by
      // the next thing played.
    });
  }, [stop]);

  // Logout or an expired token stops the audio (`stop`, keeping the saved position).
  useEffect(() => {
    if (!user) stop();
  }, [user, stop]);

  // Newest values, reachable from long-lived listeners without re-binding them.
  const stateRef = useRef({ queue, index });
  stateRef.current = { queue, index };

  const persistState = useCallback(() => {
    const audio = audioRef.current;
    const { queue: tracks, index: at } = stateRef.current;
    if (!audio || !tracks[at]) return;

    void apiClient
      .put('/me/playback-state', {
        queue: tracks.map((t) => t.id),
        queueIndex: at,
        positionSeconds: audio.currentTime,
      })
      .catch(() => {
        // Losing a position costs the resume, not the music.
      });
  }, []);

  // Saved on a tick while playing, on stop or track change, and when the page is hidden.
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(persistState, SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, persistState]);

  const currentId = current?.id;
  useEffect(() => {
    persistState();
  }, [currentId, isPlaying, persistState]);

  useEffect(() => {
    // `beforeunload` doesn't fire reliably on phones; `visibilitychange` does.
    const onHide = () => {
      if (document.visibilityState === 'hidden') persistState();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [persistState]);

  // Restore once per session, and never over something already playing.
  const restoredRef = useRef(false);

  useEffect(() => {
    if (!user) {
      // A later sign-in is a new session and deserves its own restore.
      restoredRef.current = false;
      return;
    }
    if (restoredRef.current) return;
    restoredRef.current = true; // set before awaiting, so a re-run cannot double-load

    // No `cancelled` flag: under StrictMode it would discard the only fetch that ran. The `audio.src` check guards.
    void apiClient
      .get<{ state: PlaybackState | null }>('/me/playback-state')
      .then(async ({ state }) => {
        const audio = audioRef.current;
        if (!state || state.queue.length === 0 || !audio || audio.src) return;

        originalQueueRef.current = state.queue;
        setQueue(state.queue);
        setIndex(state.queueIndex);
        // Restored paused: browsers block autoplay without a gesture.
        await load(state.queue, state.queueIndex, false, state.positionSeconds);
      })
      .catch(() => {
        // No resume is a worse start than a resume, but not a broken one.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
  }, [queue, index, repeat, dataSaver]);

  // Lock-screen and notification controls. Secure-context only, so absent over plain http on a LAN.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;

    if (!current) {
      session.metadata = null;
      return;
    }

    // Text first so the notification is never blank; the whole MediaMetadata is replaced once the cover's token resolves.
    const base = { title: current.title, artist: current.artist ?? '' };
    session.metadata = new MediaMetadata(base);

    let cancelled = false;
    void buildCoverUrl('tracks', current.id, 'full')
      .then((src) => {
        if (cancelled) return;
        session.metadata = new MediaMetadata({ ...base, artwork: [{ src, sizes: '512x512' }] });
      })
      .catch(() => {
        // A missing cover is not worth losing the title and artist over.
      });

    return () => {
      cancelled = true;
    };
  }, [current]);

  // Separate from the metadata: these handlers re-bind on queue position and repeat changes.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    const session = navigator.mediaSession;

    // Browsers throw on unsupported actions; one must not break the rest.
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not supported here; the others still bind.
      }
    };

    // Driven off the element rather than `toggle()`, so an OS button always
    // means what it says even if our own state has drifted out of sync.
    set('play', () => void audioRef.current?.play());
    set('pause', () => audioRef.current?.pause());
    set('previoustrack', () => previous());
    set('nexttrack', () => next());
    set('seekbackward', (d) => seek(currentTime - (d.seekOffset ?? SEEK_STEP_SECONDS)));
    set('seekforward', (d) => seek(currentTime + (d.seekOffset ?? SEEK_STEP_SECONDS)));
    set('seekto', (d) => {
      if (typeof d.seekTime === 'number') seek(d.seekTime);
    });
    set('stop', () => stop());

    return () => {
      const actions: MediaSessionAction[] = [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekbackward',
        'seekforward',
        'seekto',
        'stop',
      ];
      for (const action of actions) set(action, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, currentTime, queue, index, repeat, duration]);

  // Drives the lock screen's play/pause icon and its scrubber position.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.playbackState = current ? (isPlaying ? 'playing' : 'paused') : 'none';

    const total = duration || current?.duration || 0;
    try {
      if (!current || !Number.isFinite(total) || total <= 0) {
        session.setPositionState();
      } else {
        session.setPositionState({
          duration: total,
          // Clamped deliberately: a track that has just ended briefly reports a
          // position past its own duration, which the API rejects outright.
          position: Math.min(Math.max(currentTime, 0), total),
          playbackRate: 1,
        });
      }
    } catch {
      // Older browsers have no position state; only the scrubber is missing.
    }
  }, [current, isPlaying, currentTime, duration]);

  // What the server actually sent (`<audio>` exposes no headers). The backend's in-flight map dedupes this with the
  // element's own fetch.
  useEffect(() => {
    setServed(null);
    if (!current) return;

    const controller = new AbortController();
    void buildStreamUrl(current.id, dataSaver ? 'low' : undefined)
      .then((url) => probeServedStream(url, controller.signal))
      .then((info) => {
        if (!controller.signal.aborted) setServed(info);
      })
      .catch(() => {
        // Cosmetic. A missing readout must never disturb playback.
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, dataSaver]);

  // Converts the next track while this one plays, after a delay so skipping doesn't start one per track.
  const upNext =
    repeat === 'one' ? null : (queue[index + 1] ?? (repeat === 'all' && queue.length > 1 ? queue[0] : null));

  useEffect(() => {
    if (!current || !upNext) return;
    const timer = setTimeout(() => prepareTrack(upNext.id, dataSaver ? 'low' : undefined), PREPARE_NEXT_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, upNext?.id, dataSaver]);

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
  const servedLabel = served ? describeServed(served, effectiveDuration) : null;

  const value: PlayerContextValue = {
    queue,
    index,
    current,
    isPlaying,
    isLoading,
    isBuffering,
    currentTime,
    duration: effectiveDuration,
    repeat,
    isShuffled,
    dataSaver,
    volume,
    servedLabel,
    playQueue,
    playTrack,
    toggle,
    next,
    previous,
    goTo,
    seek,
    cycleRepeat,
    toggleShuffle,
    setDataSaver,
    setVolume,
    toggleMute,
    stop: stopAndForget,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}

      {/* Phone: a strip that opens the full view. The bar below is the same
          player at a size that only works with a mouse and a wide window. */}
      {user && current && !onAttractScreen && !isSheetOpen && (
        <div className="player-deck no-sweep fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 px-4 py-2.5 md:hidden">
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5 origin-left bg-orange-600"
            style={{ transform: `scaleX(${effectiveDuration ? currentTime / effectiveDuration : 0})` }}
          />
          {/* Sibling buttons: a control inside a control is invalid. */}
          <button
            onClick={() => setIsExpanded(true)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={`Now playing: ${current.title}. Open the player.`}
          >
            <CoverArt kind="tracks" id={current.id} className="h-10 w-10 shrink-0 rounded-md" alt="" />
            <span className="min-w-0 flex-1">
              <span className="player-title block truncate text-sm text-white">{current.title}</span>
              <span className="block truncate text-xs text-blue-300">{current.artist ?? 'Unknown Artist'}</span>
            </span>
          </button>
          <button
            onClick={toggle}
            disabled={isLoading}
            className={`player-play-btn pulse-ring h-10 w-10 shrink-0 ${isPlaying ? 'is-playing' : ''}`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          </button>
        </div>
      )}

      {user && current && !onAttractScreen && isSheetOpen && (
        <NowPlaying player={value} onCollapse={() => setIsExpanded(false)} />
      )}

      {user && current && !onAttractScreen && (
        <div className="player-deck fixed inset-x-0 bottom-0 z-40 hidden md:block">
          <div className="page-shell flex items-center gap-4 px-6 py-3">
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                onClick={previous}
                className="player-transport-btn h-9 w-9"
                aria-label="Previous track"
                title="Previous (P)"
              >
                <SkipBackIcon className="h-4 w-4" />
              </button>
              <button
                onClick={toggle}
                disabled={isLoading}
                className={`player-play-btn pulse-ring h-11 w-11 ${isPlaying ? 'is-playing' : ''}`}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                title="Play/pause (Space)"
              >
                {isLoading ? (
                  <span className="text-sm leading-none">…</span>
                ) : isPlaying ? (
                  <PauseIcon className="h-4.5 w-4.5" />
                ) : (
                  <PlayIcon className="h-4.5 w-4.5" />
                )}
              </button>
              <button
                onClick={next}
                className="player-transport-btn h-9 w-9"
                aria-label="Next track"
                title="Next (N)"
              >
                <SkipForwardIcon className="h-4 w-4" />
              </button>
            </div>

            <CoverArt kind="tracks" id={current.id} className="h-11 w-11" alt="" />

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="player-title truncate text-base text-white">{current.title}</span>
                <span className="truncate text-xs text-blue-300">{current.artist ?? 'Unknown Artist'}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs">
                  {isBuffering && <span className="animate-pulse text-blue-400">Buffering…</span>}
                  {servedLabel && (
                    <span
                      className={dataSaver ? 'text-orange-400' : 'text-blue-400'}
                      title="The format and bitrate actually being served"
                    >
                      {servedLabel}
                    </span>
                  )}
                  {queue.length > 1 && (
                    <span className="text-blue-400">
                      {index + 1}/{queue.length}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-blue-300">
                  {formatTime(currentTime)}
                </span>
                <div className="player-meter-outer flex-1">
                  <div className="player-meter-track">
                    <div
                      className="player-meter-fill"
                      style={{
                        '--fill': `${effectiveDuration ? (Math.min(currentTime, effectiveDuration) / effectiveDuration) * 100 : 0}%`,
                      } as CSSProperties}
                    />
                  </div>
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
                    className="player-meter-range"
                    aria-label="Seek"
                  />
                </div>
                <span className="w-9 shrink-0 font-mono text-xs tabular-nums text-blue-300">
                  {formatTime(effectiveDuration)}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <FavoriteButton
                trackId={current.id}
                isFavorited={favoriteIds.has(current.id)}
                className="mr-1 p-1"
              />
              <button
                onClick={toggleShuffle}
                disabled={queue.length < 2}
                className={`player-pill h-9 w-9 ${isShuffled ? 'is-active' : ''}`}
                aria-pressed={isShuffled}
                aria-label="Shuffle"
                title="Smart shuffle: avoids the same artist back-to-back"
              >
                <ShuffleIcon className="h-4 w-4" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`player-pill h-9 w-9 ${repeat !== 'off' ? 'is-active' : ''}`}
                aria-label={`Repeat: ${repeat}`}
                title={`Repeat: ${repeat}`}
              >
                {repeat === 'one' ? <RepeatOneIcon className="h-4 w-4" /> : <RepeatIcon className="h-4 w-4" />}
              </button>
              <button
                onClick={() => void setDataSaver(!dataSaver)}
                className={`player-pill h-9 w-9 ${dataSaver ? 'is-active' : ''}`}
                aria-pressed={dataSaver}
                aria-label="Data saver"
                title="Data saver: stream a smaller copy, re-encoded once and kept"
              >
                <DataSaverIcon className="h-4 w-4" />
              </button>
              <div className="ml-1 flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className={`player-pill h-9 w-9 ${volume === 0 ? 'is-active' : ''}`}
                  aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                  aria-pressed={volume === 0}
                  title={volume === 0 ? 'Unmute' : 'Mute'}
                >
                  {volume === 0 ? <VolumeMutedIcon className="h-4 w-4" /> : <VolumeIcon className="h-4 w-4" />}
                </button>
                <div className="player-meter-outer w-20">
                  <div className="player-meter-track">
                    <div
                      className="player-meter-fill"
                      style={{ '--fill': `${volume * 100}%` } as CSSProperties}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="player-meter-range"
                    aria-label="Volume"
                  />
                </div>
              </div>
              <button onClick={stopAndForget} className="player-pill h-9 w-9 ml-1" aria-label="Close player">
                <CloseIcon className="h-4 w-4" />
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
