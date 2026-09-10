import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { useIsPhone } from '../hooks/useIsPhone';
import { apiClient, buildCoverUrl, buildStreamUrl } from '../lib/apiClient';
import {
  describeServed,
  loadDataSaverPreference,
  probeServedStream,
  saveDataSaverPreference,
  type ServedStream,
} from '../lib/streamQuality';
import { CoverArt } from './CoverArt';
import { FavoriteButton, useFavoriteIds } from './FavoriteButton';
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from './icons';
import { NowPlaying } from './NowPlaying';
import type { PlaybackState, TrackSummary } from '../types/api';
import { useToast } from './ToastProvider';

export type QueueTrack = Pick<TrackSummary, 'id' | 'title' | 'artist' | 'duration'> &
  Partial<Pick<TrackSummary, 'format'>>;

export type RepeatMode = 'off' | 'all' | 'one';

/** Treat "previous" within this many seconds as "restart the track" — the
 *  convention every music player uses. */
const RESTART_THRESHOLD_SECONDS = 3;

const SEEK_STEP_SECONDS = 5;

/** A play counts once you've heard half the track, or four minutes of it —
 *  whichever comes first. Same rule Last.fm has used for two decades, so the
 *  numbers mean roughly what people already expect them to mean. */
const SCROBBLE_CAP_SECONDS = 240;

/** Only count time actually heard. A jump larger than this is a seek (or a
 *  buffering skip), not playback — dragging the scrubber to the end of a
 *  track shouldn't record it as listened to. */
const MAX_PLAYBACK_DELTA_SECONDS = 2;

/** How often the position is pushed while playing. */
const SAVE_INTERVAL_MS = 10_000;

interface PlayProgress {
  trackId: number;
  listenedMs: number;
  lastTime: number;
  thresholdMs: number;
  scrobbled: boolean;
}

/**
 * Resolves once the element knows enough about a newly-assigned source to be
 * seeked into. Rejects on a load failure rather than hanging, so a swap that
 * cannot happen surfaces instead of leaving the player stuck on "loading".
 */
function waitForMetadata(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('error', onFailed);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onFailed = () => {
      cleanup();
      reject(new Error('The stream could not be loaded'));
    };
    audio.addEventListener('loadedmetadata', onReady);
    audio.addEventListener('error', onFailed);
  });
}

function scrobbleThresholdMs(durationSeconds: number): number {
  // No usable duration yet — fall back to the cap, and let `loadedmetadata`
  // tighten it once the browser knows how long the track really is.
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return SCROBBLE_CAP_SECONDS * 1000;
  return Math.min(durationSeconds / 2, SCROBBLE_CAP_SECONDS) * 1000;
}

export interface PlayerContextValue {
  queue: QueueTrack[];
  index: number;
  current: QueueTrack | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  repeat: RepeatMode;
  isShuffled: boolean;
  dataSaver: boolean;
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
  const [served, setServed] = useState<ServedStream | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  // Phone only: the bar collapses to a strip and this opens the full view.
  const [isExpanded, setIsExpanded] = useState(false);
  const isPhone = useIsPhone();
  // Only the phone strip can open the sheet, and only the sheet can close it —
  // so a window that grows past `md` mid-playback would otherwise strand the
  // user with a hidden sheet, no strip, and nothing left to press. Deriving the
  // open state instead of storing it means widening hands the desktop bar back
  // and narrowing returns them to where they were.
  const isSheetOpen = isExpanded && isPhone;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The pre-shuffle order, so turning shuffle off restores it rather than
  // leaving the queue permanently scrambled.
  const originalQueueRef = useRef<QueueTrack[] | null>(null);
  // Listening progress for the current play, kept in a ref so the audio
  // element's long-lived listeners always see live values without re-binding
  // on every timeupdate.
  const progressRef = useRef<PlayProgress | null>(null);
  // True while a quality swap is reassigning `src`. Reassigning resets the
  // element's clock to 0, and painting that would flick the scrubber back to
  // the start for the ~300 ms until the seek lands.
  const swappingRef = useRef(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();
  const favoriteIds = useFavoriteIds();

  const current = queue[index] ?? null;

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTime = () => {
      // Mid-swap the clock is briefly 0 and means nothing: not a position to
      // show, and not time anybody listened to.
      if (swappingRef.current) return;
      setCurrentTime(audio.currentTime);
      recordListenedTime(audio.currentTime);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scrobble(trackId: number, msPlayed: number) {
    try {
      await apiClient.post(`/tracks/${trackId}/scrobble`, { msPlayed });
      // Play counts show up in the library table and the track drawer, so let
      // whatever is on screen pick up the new number.
      void queryClient.invalidateQueries({ queryKey: ['tracks'] });
      void queryClient.invalidateQueries({ queryKey: ['track', trackId] });
    } catch {
      // A missed scrobble costs a statistic, not the music. Never interrupt
      // playback — or nag the listener — over one.
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

  async function load(tracks: QueueTrack[], at: number, autoplay = true, resumeAt = 0) {
    const audio = audioRef.current;
    const track = tracks[at];
    if (!audio || !track) return;

    setIsLoading(true);
    setCurrentTime(0);
    // A fresh play — including repeat-one starting the same track again, which
    // is a second listen and should scrobble a second time.
    progressRef.current = {
      trackId: track.id,
      listenedMs: 0,
      lastTime: 0,
      thresholdMs: scrobbleThresholdMs(track.duration ?? 0),
      scrobbled: false,
    };
    // Fall back to the duration the scanner recorded — some Ogg/Opus streams
    // don't report a usable duration until fully buffered.
    setDuration(track.duration ?? 0);

    try {
      audio.src = await buildStreamUrl(track.id, dataSaver ? 'low' : undefined);
      if (resumeAt > 0) {
        // Nothing can be seeked until the browser knows how long the track is.
        await waitForMetadata(audio);
        audio.currentTime = resumeAt;
        // Restoring is not listening. Anchoring here stops the jump up from 0
        // being counted as time heard, which would scrobble a track nobody
        // has played yet.
        if (progressRef.current) progressRef.current.lastTime = resumeAt;
        setCurrentTime(resumeAt);
      }
      if (autoplay) await audio.play();
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not play ${track.title}`, 'error');
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Flipping the toggle applies to what is playing right now, not just to the
   * next track — a control that appears to do nothing for the next four
   * minutes reads as broken.
   *
   * The converted copy is warmed *before* the element is touched. Making one
   * takes seconds on a cold cache (measured 2026-09-10: 5.7 s for a 172 s
   * track), and the copy already playing stays perfectly good throughout, so
   * swapping first would spend that entire wait in silence — the loudest
   * possible way to answer a button press. Waiting first means the music never
   * stops and the swap itself is instant.
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

    setIsLoading(true);
    try {
      const url = await buildStreamUrl(track.id, enabled ? 'low' : undefined);

      // Doubles as the readout probe and as the "is it ready yet" wait: the
      // response does not arrive until the file exists.
      const served = await probeServedStream(url, controller.signal);
      if (token !== swapRef.current.token) return;
      if (!served) throw new Error('The converted copy could not be prepared');

      // Read the position *after* the wait, not before it — the track kept
      // playing, so the spot to land on has moved.
      const resumeAt = audio.currentTime;
      const wasPlaying = !audio.paused;

      swappingRef.current = true;
      audio.src = url;
      await waitForMetadata(audio);
      audio.currentTime = resumeAt;
      // The same listen continues across the swap, so `progressRef` is left
      // alone and this is not a second scrobble. Re-anchoring `lastTime` stops
      // the jump back up to `resumeAt` from being counted as time heard.
      if (progressRef.current) progressRef.current.lastTime = resumeAt;
      setCurrentTime(resumeAt);
      swappingRef.current = false;
      if (wasPlaying) await audio.play();
    } catch (err) {
      swappingRef.current = false;
      if (token !== swapRef.current.token) return; // superseded, not failed
      // An abort is not a refusal. It means either a second press took over,
      // or the page is going away mid-request — reverting the preference on
      // the way out would quietly undo a choice the listener did make.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Otherwise put the toggle back rather than leaving it claiming a
      // quality that is not being served: the readout is built from this flag,
      // so a stale one would make the player misreport itself.
      setDataSaverState(!enabled);
      saveDataSaverPreference(!enabled);
      showToast('Could not switch quality — still playing the original', 'error');
    } finally {
      if (token === swapRef.current.token) setIsLoading(false);
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

  /**
   * Closing the player is a deliberate "I am done", so it erases the saved
   * position too — otherwise the next tab resumes a queue already dismissed.
   *
   * Kept apart from `stop` because logging out must NOT erase it. Both used to
   * be the same call, and sharing it would mean a token expiring quietly threw
   * away the position the feature exists to keep.
   */
  const stopAndForget = useCallback(() => {
    stop();
    void apiClient.delete('/me/playback-state').catch(() => {
      // The queue is already gone locally; a stale row will be overwritten by
      // the next thing played.
    });
  }, [stop]);

  // The queue belongs to the session. Logging out — or having a token expire
  // out from under us — has to take the audio with it, or the bar keeps
  // playing the previous user's library over the login screen. This is `stop`,
  // not `stopAndForget`: the position should be waiting when you come back.
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

  // Three moments, because none of them covers the others: a tick while
  // playing (a crash or a killed tab loses at most one interval), the moment
  // playback stops or moves to another track, and the page being hidden.
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
    // `visibilitychange` rather than `beforeunload`: the latter does not fire
    // reliably on a phone, which is exactly where a tab gets killed in the
    // background.
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

    // Deliberately no `cancelled` flag. StrictMode invokes this twice: a
    // cleanup that cancelled the first call would throw away the only fetch
    // that ran, because the second call bails on the ref above. The guard
    // that actually matters is `audio.src` below — if anything is loaded by
    // the time this resolves, the listener got there first and wins.
    void apiClient
      .get<{ state: PlaybackState | null }>('/me/playback-state')
      .then(async ({ state }) => {
        const audio = audioRef.current;
        if (!state || state.queue.length === 0 || !audio || audio.src) return;

        originalQueueRef.current = state.queue;
        setQueue(state.queue);
        setIndex(state.queueIndex);
        // Paused, deliberately. Browsers block autoplay without a gesture, so
        // "resume and play" would silently do nothing on a phone — the one
        // place it would matter most. Restore the state; let the play button
        // do the rest.
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

  // Lock-screen and notification transport. Without this the OS only knows
  // that "a tab is playing audio": no title, no artwork, no skip buttons —
  // on a phone that is most of the difference between a browser tab and
  // something that behaves like a music player.
  //
  // The API is secure-context only, so `navigator.mediaSession` is simply
  // absent over plain http:// on a LAN address. The guard keeps that a missing
  // nicety rather than a crash; reach the app over https to see any of it.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;

    if (!current) {
      session.metadata = null;
      return;
    }

    // Artwork needs a media token, so it can only arrive a beat later. Set the
    // text straight away so the notification is never blank, then replace the
    // whole MediaMetadata once the cover resolves — `artwork` is read at
    // assignment, so mutating the object already handed over would not take.
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

  // Kept apart from the metadata above because these close over the transport:
  // they have to re-bind whenever the queue position or repeat mode changes,
  // where the metadata only ever depends on the track itself.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    const session = navigator.mediaSession;

    // Which actions exist varies by platform, and browsers throw on the ones
    // they don't implement. One unsupported action must not take the rest of
    // the transport down with it.
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
      // Older browsers expose no position state at all — the play/pause icon
      // above still works, only the scrubber is missing.
    }
  }, [current, isPlaying, currentTime, duration]);

  // What the server actually sent, which is not always what was asked for:
  // the backend refuses to downgrade a source that is already at or below the
  // target bitrate. Kept in its own request because an `<audio>` element
  // exposes no response headers at all; on a cache miss it costs nothing extra,
  // since the element is fetching the same variant and the backend's in-flight
  // map collapses the two into one transcode.
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
    currentTime,
    duration: effectiveDuration,
    repeat,
    isShuffled,
    dataSaver,
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
    stop: stopAndForget,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}

      {/* Phone: a strip that opens the full view. The bar below is the same
          player at a size that only works with a mouse and a wide window. */}
      {user && current && !isSheetOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-blue-800 bg-blue-900 px-4 py-2.5 md:hidden">
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5 origin-left bg-orange-600"
            style={{ transform: `scaleX(${effectiveDuration ? currentTime / effectiveDuration : 0})` }}
          />
          {/* Two sibling buttons rather than one nested in the other: a control
              inside a control is invalid, and screen readers announce only the
              outer one. */}
          <button
            onClick={() => setIsExpanded(true)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={`Now playing: ${current.title}. Open the player.`}
          >
            <CoverArt kind="tracks" id={current.id} className="h-10 w-10 shrink-0 rounded-md" alt="" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{current.title}</span>
              <span className="block truncate text-xs text-blue-300">{current.artist ?? 'Unknown Artist'}</span>
            </span>
          </button>
          <button
            onClick={toggle}
            disabled={isLoading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white disabled:opacity-60"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          </button>
        </div>
      )}

      {user && current && isSheetOpen && (
        <NowPlaying player={value} onCollapse={() => setIsExpanded(false)} />
      )}

      {user && current && (
        <div className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-blue-800 bg-blue-900 md:block">
          <div className="page-shell flex items-center gap-4 px-6 py-3">
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={previous}
                className="btn-ghost btn-sm h-9 w-9 !px-0"
                aria-label="Previous track"
                title="Previous (P)"
              >
                <SkipBackIcon />
              </button>
              <button
                onClick={toggle}
                disabled={isLoading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white transition-colors hover:bg-orange-500 disabled:opacity-60"
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
                className="btn-ghost btn-sm h-9 w-9 !px-0"
                aria-label="Next track"
                title="Next (N)"
              >
                <SkipForwardIcon />
              </button>
            </div>

            <CoverArt kind="tracks" id={current.id} className="h-11 w-11" alt="" />

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium text-white">{current.title}</span>
                <span className="truncate text-xs text-blue-300">{current.artist ?? 'Unknown Artist'}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs">
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
              <FavoriteButton
                trackId={current.id}
                isFavorited={favoriteIds.has(current.id)}
                className="mr-1 p-1"
              />
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
              <button
                onClick={() => void setDataSaver(!dataSaver)}
                className={`btn-ghost btn-sm ${dataSaver ? 'text-orange-500' : ''}`}
                aria-pressed={dataSaver}
                title="Data saver — stream a smaller copy, re-encoded once and kept"
              >
                Data saver
              </button>
              <button onClick={stopAndForget} className="btn-ghost btn-sm" aria-label="Close player">
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
