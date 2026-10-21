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
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useIsPhone } from '../hooks/useIsPhone';
import { useSwapClass } from '../hooks/useSwapClass';
import { Presence } from './Presence';
import { apiClient, buildCoverUrl, buildStreamUrl, prepareTrack, reportPlaybackFailure } from '../lib/apiClient';
import {
  describeMediaError,
  describeServed,
  loadDataSaverPreference,
  probeServedStream,
  saveDataSaverPreference,
  type ServedStream,
} from '../lib/streamQuality';
import {
  canFadeVolume,
  isNextOnAlbum,
  loadTransitionPrefs,
  saveTransitionPrefs,
  type BetweenSongs,
  type TransitionPrefs,
} from '../lib/transitions';
import { CoverArt } from './CoverArt';
import { FavoriteButton, useFavoriteIds } from './FavoriteButton';
import {
  ChevronDownIcon,
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
import { DesktopNowPlaying } from './DesktopNowPlaying';
import { NowPlaying } from './NowPlaying';
import { useRoom } from './RoomProvider';
import { expectedPositionMs, roomNextLabel, type RoomState } from '../lib/roomClient';
import { applyLevel, levelFactor, resumeLevelling } from '../lib/levelling';
import {
  createPressCounter,
  HEADSET_SEEK_SECONDS,
  loadHeadsetPrefs,
  type HeadsetAction,
} from '../lib/headsetButtons';
import type { PlaybackState, TrackSummary } from '../types/api';
import { useToast } from './ToastProvider';
import { loadEndlessPreference, radioSource, saveEndlessPreference } from '../lib/mix';

export type QueueTrack = Pick<TrackSummary, 'id' | 'title' | 'artist' | 'duration'> &
  Partial<Pick<TrackSummary, 'format' | 'albumId' | 'trackNumber' | 'gainDb'>> & {
    /** In a room: who added it, so queue rows can show their picture (A256). */
    addedBy?: { userId: number; name: string; avatarId: string | null };
  };

export type RepeatMode = 'off' | 'all' | 'one';
/** Fetches the next batch of songs for a running queue; an empty list means the source is used up. */
export type LoadMore = () => Promise<QueueTrack[]>;

/** "Previous" within this many seconds restarts the track. */
const RESTART_THRESHOLD_SECONDS = 3;

const SEEK_STEP_SECONDS = 5;

/**
 * In a room, off by this much (twice in a row) means seek back into step. Listeners are in different places, so a few
 * hundred ms is inaudible (spec: `.docs/specs/room-sync.md`, "Drift").
 */
const ROOM_DRIFT_LIMIT_MS = 300;
/** A song picked with Play in a room waits this long for the server to add it, then the jump is dropped. */
const ROOM_PENDING_JUMP_MS = 10_000;
/** Play on a song in a room adds it and up to this many in all, so a long list can't fill the room's 500. */
const ROOM_ADD_MAX = 50;

/** A play counts at half the track or four minutes, whichever is first (Last.fm's rule). */
const SCROBBLE_CAP_SECONDS = 240;

/** A jump bigger than this is a seek, not listening. */
const MAX_PLAYBACK_DELTA_SECONDS = 2;

/** How often the position is pushed while playing. */
const SAVE_INTERVAL_MS = 10_000;
/** Songs left in the queue at which a queue with a `loadMore` source asks it for the next batch (Q205). */
const TOP_UP_AT = 20;
/** The server keeps at most this many queue entries (`MAX_QUEUE_LENGTH`); a longer queue is saved as a window. */
const MAX_SAVED_QUEUE = 5000;

/** How long a track has to stay current before the next one is converted ahead of time, and preloaded. */
const PREPARE_NEXT_DELAY_MS = 15_000;

/** A gapless start is scheduled once this little is left, on a timer more precise than `timeupdate` (~4 Hz). */
const GAPLESS_SCHEDULE_S = 0.4;

/** The next song starts this early, so the two overlap by a few ms rather than leave a gap. */
const GAPLESS_LEAD_S = 0.01;

/** The pause, play and skip fade (A71). */
const SHORT_FADE_MS = 150;

/** Volume ramps step this often. Audible tabs aren't timer-throttled, so it holds in the background. */
const RAMP_STEP_MS = 20;

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

/** `play()` refused by the browser's autoplay policy (no user gesture yet), not by the file. */
function isAutoplayBlocked(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotAllowedError';
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
  /**
   * `loadMore` keeps the queue going: when few songs remain it is called for the next batch, and an empty answer
   * means there is no more. Left out, the queue is exactly `tracks`.
   */
  playQueue: (tracks: QueueTrack[], startIndex: number, loadMore?: LoadMore) => void;
  playTrack: (track: QueueTrack) => void;
  /** Plays [tracks] (default just [track]), then keeps going with songs like [track] (A234). */
  startRadio: (track: QueueTrack, tracks?: QueueTrack[]) => void;
  /** When the queue runs out, keep playing songs like its last one (A235). Per device. */
  endless: boolean;
  setEndless: (enabled: boolean) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
  /** Drops a song from the queue. Not the one playing; in a room it asks the room to. */
  removeAt: (index: number) => void;
  seek: (seconds: number) => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;
  setDataSaver: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  stop: () => void;
  /** Gapless, crossfade or fade out then in, plus the pause fade and the album rule (A71, A72). Per device. */
  transitions: TransitionPrefs;
  setTransitions: (prefs: TransitionPrefs) => void;
  /** False on iOS and iPadOS, which ignore `audio.volume`: fades are unavailable there, gapless still works. */
  canFade: boolean;
  /** In a "Listen together" room: the transport drives the room for everyone, and shuffle and repeat are off. */
  inRoom: boolean;
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
  const [transitions, setTransitionsState] = useState(loadTransitionPrefs);
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
  // account-select screens, where a leftover queue would peek out from under their cards. The title screen is `/` while
  // signed out; account select keeps `/login` through its post-sign-in steps (passcode setup, register).
  const { pathname } = useLocation();
  const { user } = useAuth();
  const onAttractScreen = !user || pathname.startsWith('/login');
  // Derived, not stored: widening past `md` with the sheet open would otherwise strand the user with no controls.
  const isSheetOpen = isExpanded && isPhone;
  // Wide screens get the full view instead of the sheet, with the bar still showing under it.
  const isDesktopViewOpen = isExpanded && !isPhone;

  // Any route change closes the desktop view, so a link inside it, or the browser's back, lands on a visible page.
  useEffect(() => {
    setIsExpanded(false);
  }, [pathname]);

  // Two elements that trade places at each song boundary (A56): `audioRef` is the one playing, everything else reads
  // it; `spareRef` loads the next song ahead of time, and during a crossfade it is the song fading out.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spareRef = useRef<HTMLAudioElement | null>(null);
  // What the spare holds, so a boundary can tell whether it is the right song at the right quality.
  const preloadRef = useRef<{ trackId: number; quality: 'low' | undefined } | null>(null);
  // A boundary already under way for the playing song, so `timeupdate` starts it once. `timer` is a scheduled
  // gapless start; `fadeOutIn` waits for `ended` to start the next song.
  const transitionRef = useRef<{ kind: BetweenSongs; fadeSeconds: number; timer?: number } | null>(null);
  // Each element's fade (0 to 1). Its volume is the user's volume times this, so a fade never touches the slider.
  const fadeGainRef = useRef(new Map<HTMLAudioElement, number>());
  // Each element's levelling gain in dB (A3), set with the song it loads; elements trade places, so it goes with them.
  const levelRef = useRef(new Map<HTMLAudioElement, number | null | undefined>());
  const rampsRef = useRef(new Map<HTMLAudioElement, { timer: number; done: () => void }>());
  const volumeRef = useRef(volume);
  const transitionsRef = useRef(transitions);
  transitionsRef.current = transitions;
  const [canFade] = useState(canFadeVolume);
  // Bumped by every pause, play and skip, so a fade that finishes late can tell it was overtaken.
  const fadeActionRef = useRef(0);
  // A skip still fading out the old song. A pause or play in that time finishes it (paused or playing) rather than
  // dropping it, so the index and the audio never disagree.
  const pendingSkipRef = useRef<{ tracks: QueueTrack[]; at: number } | null>(null);
  // A pause fading out. The song is still "playing" until the fade ends, but no boundary may start in that time.
  const pausingRef = useRef(false);
  // Bumped at each song boundary, so the preload effect runs again even when the next song is the same one (repeat-one).
  const [boundaryCount, setBoundaryCount] = useState(0);
  // Set each render (see `checkBoundary`, `handleEnded`); the listeners bound at mount call through these.
  const boundaryRef = useRef<(audio: HTMLAudioElement) => void>(() => {});
  const endedRef = useRef<() => void>(() => {});
  // The pre-shuffle order, so turning shuffle off restores it rather than
  // leaving the queue permanently scrambled.
  const originalQueueRef = useRef<QueueTrack[] | null>(null);
  // The current queue's source of more songs, if it has one. Replaced or cleared whenever the queue is.
  // `radio`: the endless queue's own source, which is never replaced by another radio once it runs dry.
  const moreRef = useRef<{ fetch: LoadMore; busy: boolean; done: boolean; radio?: boolean } | null>(null);
  const [endless, setEndlessState] = useState(loadEndlessPreference);
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
  // Read by `scrobble`, which runs from listeners bound once on mount and
  // would otherwise see the user as it was on the first render.
  const isGuestRef = useRef(false);
  isGuestRef.current = Boolean(user?.isGuest);
  const { showToast } = useToast();
  const favoriteIds = useFavoriteIds();

  // "Listen together": while a room is joined this player follows the room's state (`syncToRoom`) and its transport
  // sends room commands. A ref, so lock-screen handlers and timers bound earlier always see the current room.
  const roomCtx = useRoom();
  const inRoom = roomCtx.room !== null;
  const roomRef = useRef(roomCtx);
  roomRef.current = roomCtx;
  // The room entry the playing element holds, so the sync loop can tell when the room moved to another song.
  const roomEntryRef = useRef<number | null>(null);
  const roomQueueKeyRef = useRef('');
  const roomTracksRef = useRef<QueueTrack[]>([]);
  const roomLoadingRef = useRef(false);
  // Which room load is the newest: an older one settling must not clear `roomLoadingRef` while a newer one runs.
  const roomLoadSeqRef = useRef(0);
  const roomStartTimerRef = useRef<number | undefined>(undefined);
  const retireTimerRef = useRef<number | undefined>(undefined);
  const driftStrikesRef = useRef(0);
  const lastDriftRef = useRef<number | null>(null);
  // Starting or jumping takes this device a moment, so aiming at the exact position lands behind it (measured ~0.7 s
  // in Chromium). Learned from how late the last start or jump landed; 0 to 1 s.
  const seekLeadRef = useRef(0);
  const afterCorrectionRef = useRef(false);
  // Play pressed in a room: the songs go in after the current one, and this jumps to the picked one once it's there.
  const pendingRoomJumpRef = useRef<{ afterEntryId: number | undefined; offset: number; trackId: number; at: number } | null>(
    null,
  );
  const syncRef = useRef<() => void>(() => {});
  const isBufferingRef = useRef(false);
  isBufferingRef.current = isBuffering;

  const current = queue[index] ?? null;
  const swapClass = useSwapClass(current?.id ?? 0, index);

  useEffect(() => {
    scrubbingRef.current = isScrubbing;
  }, [isScrubbing]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    // Bound to both elements; each listener acts only while its element is the playing one, so the spare's preload
    // and a song fading out stay silent to the rest of the player.
    function bind(audio: HTMLAudioElement): () => void {
      // Buffer as much as the browser allows while foregrounded.
      audio.preload = 'auto';
      // Read fresh: this effect runs once, at mount.
      audio.volume = loadVolumePreference();
      const isActive = () => audio === audioRef.current;

      const onTime = () => {
        if (!isActive()) return;
        // Mid-swap the clock is briefly 0 and means nothing: not a position to
        // show, and not time anybody listened to.
        if (swappingRef.current) return;
        // Audio plays on under a drag, so it still counts as listened.
        recordListenedTime(audio.currentTime);
        if (!scrubbingRef.current) setCurrentTime(audio.currentTime);
        boundaryRef.current(audio);
      };
      const onMeta = () => {
        if (!isActive()) return;
        const known = Number.isFinite(audio.duration) ? audio.duration : 0;
        setDuration(known);
        // The scanner's duration can be missing or wrong; once the browser has
        // decoded the header it knows better, so re-derive the threshold.
        if (progressRef.current && known > 0) {
          progressRef.current.thresholdMs = scrobbleThresholdMs(known);
        }
      };
      const onPlay = () => {
        if (isActive()) setIsPlaying(true);
      };
      const onPause = () => {
        if (isActive()) setIsPlaying(false);
      };
      const onWaiting = () => {
        if (isActive()) setIsBuffering(true);
      };
      const onPlaying = () => {
        if (!isActive()) return;
        hasStartedRef.current = true;
        consecutiveLoadFailuresRef.current = 0;
        setIsBuffering(false);
      };
      // A source that was playing and broke: dropped connection, decode error, or a lapsed `?token=` on seek.
      // `load()` and the quality swap handle their own errors. A spare that fails to preload is caught at the
      // boundary instead, which falls back to a normal load.
      const onError = () => {
        if (!isActive()) return;
        if (swappingRef.current || !hasStartedRef.current) return;
        hasStartedRef.current = false;

        const { queue: tracks, index: at } = stateRef.current;
        const track = tracks[at];
        if (!track) return;

        void reconnect(track, progressRef.current?.lastTime ?? 0, isPlayingRef.current);
      };
      const onEnded = () => {
        if (isActive()) endedRef.current();
      };

      audio.addEventListener('timeupdate', onTime);
      audio.addEventListener('loadedmetadata', onMeta);
      audio.addEventListener('durationchange', onMeta);
      audio.addEventListener('play', onPlay);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('waiting', onWaiting);
      audio.addEventListener('playing', onPlaying);
      audio.addEventListener('error', onError);
      audio.addEventListener('ended', onEnded);

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
        audio.removeEventListener('ended', onEnded);
      };
    }

    const first = new Audio();
    const second = new Audio();
    // An element routed through Web Audio for a boost is silent while the context is suspended.
    first.addEventListener('play', resumeLevelling);
    second.addEventListener('play', resumeLevelling);
    audioRef.current = first;
    spareRef.current = second;
    const unbindFirst = bind(first);
    const unbindSecond = bind(second);
    // The ref objects, not their values: the cleanup must see the latest action count and planned transition.
    const ramps = rampsRef.current;
    const fadeAction = fadeActionRef;
    const transition = transitionRef;
    return () => {
      // Nothing scheduled may act on the elements after this: fades, a pending skip or pause, a timed song start.
      ++fadeAction.current;
      for (const ramp of ramps.values()) window.clearInterval(ramp.timer);
      ramps.clear();
      if (transition.current?.timer !== undefined) window.clearTimeout(transition.current.timer);
      transition.current = null;
      unbindFirst();
      unbindSecond();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The element's volume is the user's volume times its fade, times its song's levelling when that is on. */
  function setFadeGain(audio: HTMLAudioElement, gain: number) {
    fadeGainRef.current.set(audio, gain);
    const level = canFade && transitionsRef.current.levelVolume ? levelFactor(levelRef.current.get(audio)) : 1;
    applyLevel(audio, volumeRef.current * gain * level);
  }

  function fadeGain(audio: HTMLAudioElement): number {
    return fadeGainRef.current.get(audio) ?? 1;
  }

  function cancelRamp(audio: HTMLAudioElement) {
    const ramp = rampsRef.current.get(audio);
    if (!ramp) return;
    window.clearInterval(ramp.timer);
    rampsRef.current.delete(audio);
    ramp.done();
  }

  /**
   * Linear fade of one element to `target` over `ms`. Resolves when it lands or is cancelled; callers that care
   * re-check state after. Instant where the browser ignores `volume` (iOS), so nothing waits on a fade that can't run.
   */
  function rampTo(audio: HTMLAudioElement, target: number, ms: number): Promise<void> {
    cancelRamp(audio);
    if (!canFade || ms <= 0) {
      setFadeGain(audio, target);
      return Promise.resolve();
    }
    const from = fadeGain(audio);
    const start = performance.now();
    return new Promise((resolve) => {
      const timer = window.setInterval(() => {
        const t = Math.min((performance.now() - start) / ms, 1);
        setFadeGain(audio, from + (target - from) * t);
        if (t >= 1) {
          window.clearInterval(timer);
          rampsRef.current.delete(audio);
          resolve();
        }
      }, RAMP_STEP_MS);
      rampsRef.current.set(audio, { timer, done: resolve });
    });
  }

  /** Silences and empties the spare: after a boundary, on any explicit jump, on stop. */
  function retireSpare() {
    const spare = spareRef.current;
    if (!spare) return;
    cancelRamp(spare);
    spare.pause();
    if (spare.hasAttribute('src')) {
      spare.removeAttribute('src');
      spare.load(); // drops the in-flight range request
    }
    levelRef.current.delete(spare);
    setFadeGain(spare, 1);
    preloadRef.current = null;
  }

  function clearTransition() {
    if (transitionRef.current?.timer !== undefined) window.clearTimeout(transitionRef.current.timer);
    transitionRef.current = null;
  }

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

    // A skip during the wait loads another song on this element; this attempt must then leave it alone, not seek the
    // new song to the old one's position. `load()` clears `swappingRef` for itself.
    const token = loadTokenRef.current;
    const superseded = () => token !== loadTokenRef.current;

    async function attempt(forceCompat: boolean): Promise<void> {
      const url = await buildStreamUrl(track.id, stateRef.current.dataSaver ? 'low' : undefined, forceCompat);
      if (superseded()) return;
      audio!.src = url;
      await waitForMetadata(audio!);
      if (superseded()) return;
      audio!.currentTime = resumeAt;
      if (progressRef.current) progressRef.current.lastTime = resumeAt;
      setCurrentTime(resumeAt);
    }

    swappingRef.current = true;
    try {
      try {
        await attempt(false);
      } catch (err) {
        if (superseded()) return;
        // One silent retry through the compat transcode (see `load()`).
        if (err instanceof StreamLoadError && isRetryableMediaError(err.info.mediaErrorCode)) {
          await attempt(true);
        } else {
          throw err;
        }
      }
      if (superseded()) return;
      swappingRef.current = false;
      if (wasPlaying) await audio.play();
    } catch (err) {
      if (superseded()) return;
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
    pausingRef.current = false;
    // A data-saver swap or reconnect still working on the last song gives way to this one.
    swapRef.current.abort?.abort();
    swapRef.current = { token: swapRef.current.token + 1, abort: null };
    swappingRef.current = false;
    // An explicit load replaces whatever the spare held or was fading out.
    clearTransition();
    retireSpare();
    const fadeIn = autoplay && canFade && transitionsRef.current.fadeOnPause;
    cancelRamp(audio);
    levelRef.current.set(audio, track.gainDb);
    setFadeGain(audio, fadeIn ? 0 : 1);

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
      const url = await buildStreamUrl(track.id, stateRef.current.dataSaver ? 'low' : undefined, forceCompat);
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
          if (fadeIn) void rampTo(audio!, 1, SHORT_FADE_MS);
        } catch (err) {
          // The browser wants a tap first; the file is fine, so no diagnostics and no compat retry.
          if (isAutoplayBlocked(err)) throw err;
          // A newer load interrupted this play; the user has moved on, so skip the probe and the failure report.
          if (token !== loadTokenRef.current || (err instanceof DOMException && err.name === 'AbortError')) throw err;
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

      // Not a playback failure: skipping would hit the same block on every song (all logged as failures). Stay on
      // this one, loaded and paused, so the next press of Play starts it.
      if (isAutoplayBlocked(err)) {
        consecutiveLoadFailuresRef.current = 0;
        setIsPlaying(false);
        showToast(`The browser blocked sound until you interact with the page. Press Play to start "${track.title}".`, 'error');
        return;
      }

      const info = err instanceof StreamLoadError ? err.info : EMPTY_FAILURE_INFO;
      reportPlaybackFailure(track.id, {
        mediaErrorCode: info.mediaErrorCode,
        contentType: info.contentType,
        detail: err instanceof Error ? err.message : String(err),
      });

      // Skip past a bad file like `next()` would, capped at one pass over the queue.
      // `tracks` and the repeat mode as they are now: this render's `queue` and `repeat` may predate the queue just loaded.
      const repeatMode = stateRef.current.repeat;
      const nextIndex = at < tracks.length - 1 ? at + 1 : repeatMode === 'all' && tracks.length > 0 ? 0 : -1;
      consecutiveLoadFailuresRef.current += 1;
      const failureCount = consecutiveLoadFailuresRef.current;

      if (nextIndex >= 0 && failureCount <= tracks.length) {
        // Failures arrive in quick succession; after two, more toasts add nothing.
        if (failureCount <= 2) {
          showToast(`Skipped "${track.title}": it could not be played${info.detail}`, 'error');
        }
        setIndex(nextIndex);
        void load(tracks, nextIndex);
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
    // A skip (`load()` also bumps the swap token) or a gapless/crossfade boundary since then: the element and song this
    // swap set out to change are gone.
    const loadToken = loadTokenRef.current;
    const superseded = () => token !== swapRef.current.token || loadToken !== loadTokenRef.current;

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
      if (superseded()) return;
      if (!served) throw new Error('The converted copy could not be prepared');

      // Read after the wait: the track kept playing.
      resumeAt = audio.currentTime;
      wasPlaying = !audio.paused;
      previousSrc = audio.src;

      swappingRef.current = true;
      reassigned = true;
      audio.src = url;
      await waitForMetadata(audio);
      if (superseded()) return;
      audio.currentTime = resumeAt;
      // The same listen continues; re-anchor so the jump to `resumeAt` isn't counted.
      if (progressRef.current) progressRef.current.lastTime = resumeAt;
      setCurrentTime(resumeAt);
      swappingRef.current = false;
      if (wasPlaying) await audio.play();
    } catch (err) {
      if (superseded()) return; // superseded, not failed; whatever took over owns `swappingRef`
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

  /** Set on the elements directly; a dragged slider fires many times a second. Each keeps its own fade. */
  function setVolume(next: number) {
    const clamped = Math.min(Math.max(next, 0), 1);
    setVolumeState(clamped);
    saveVolumePreference(clamped);
    volumeRef.current = clamped;
    for (const audio of [audioRef.current, spareRef.current]) {
      if (audio) setFadeGain(audio, fadeGain(audio));
    }
    if (clamped > 0) preMuteVolumeRef.current = clamped;
  }

  function setTransitions(prefs: TransitionPrefs) {
    setTransitionsState(prefs);
    saveTransitionPrefs(prefs);
    // Levelling switched on or off applies to the song already playing, not just the next one.
    transitionsRef.current = prefs;
    for (const audio of [audioRef.current, spareRef.current]) {
      if (audio) setFadeGain(audio, fadeGain(audio));
    }
    // A boundary already timed for the old setting would run the wrong way; the next `timeupdate` re-plans it.
    if (transitionRef.current && transitionRef.current.kind !== 'fadeOutIn') clearTransition();
  }

  function toggleMute() {
    setVolume(volume > 0 ? 0 : preMuteVolumeRef.current);
  }

  /** The room's playing entry, from the ref so handlers bound on an earlier render act on the room as it is now. */
  function roomCurrentEntry() {
    const room = roomRef.current.room;
    return room ? room.queue[room.current] : undefined;
  }

  function playQueue(tracks: QueueTrack[], startIndex: number, loadMore?: LoadMore) {
    if (tracks.length === 0) return;
    const at = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    if (roomRef.current.room) {
      // In a room, Play adds to the shared queue after the current song and jumps there once the server has it,
      // rather than replacing everyone's queue.
      // From the picked song on, at most ROOM_ADD_MAX: the songs before it aren't what was asked for, and a long list
      // would hit the room's 500-song cap and add nothing (the same rule as Android's `roomPlay`).
      const after = roomCurrentEntry()?.entryId;
      const picked = tracks.slice(at, at + ROOM_ADD_MAX);
      pendingRoomJumpRef.current = { afterEntryId: after, offset: 0, trackId: picked[0].id, at: Date.now() };
      roomRef.current.send({ op: 'add', trackIds: picked.map((t) => t.id), after });
      return;
    }
    originalQueueRef.current = tracks;
    moreRef.current = loadMore ? { fetch: loadMore, busy: false, done: false } : null;
    setIsShuffled(false);
    setQueue(tracks);
    setIndex(at);
    void load(tracks, at);
  }

  function playTrack(track: QueueTrack) {
    playQueue([track], 0);
  }

  function startRadio(track: QueueTrack, tracks: QueueTrack[] = [track]) {
    playQueue(tracks, 0, radioSource(track.id, () => stateRef.current.queue.map((queued) => queued.id)));
  }

  function setEndless(enabled: boolean) {
    setEndlessState(enabled);
    saveEndlessPreference(enabled);
  }

  function goTo(at: number) {
    if (at < 0 || at >= queue.length) return;
    setIndex(at);
    void load(queue, at);
  }

  /** A skip the user asked for: the short fade out first (A71), then the jump. Auto-advance uses `goTo`. */
  function jumpTo(at: number) {
    if (at < 0 || at >= queue.length) return;
    const room = roomRef.current.room;
    if (room) {
      const entry = room.queue[at];
      if (entry) roomRef.current.send({ op: 'jump', entryId: entry.entryId });
      return;
    }
    const audio = audioRef.current;
    const action = ++fadeActionRef.current;
    pendingSkipRef.current = null;
    // A gapless start timed for the old song would fire during the fade and skip a second track.
    clearTransition();
    if (!audio || audio.paused || !canFade || !transitionsRef.current.fadeOnPause) return goTo(at);
    const tracks = queue;
    setIndex(at);
    pendingSkipRef.current = { tracks, at };
    void rampTo(audio, 0, SHORT_FADE_MS).then(() => {
      // A newer skip, pause or play since then owns the player, and finishes this skip itself.
      if (action !== fadeActionRef.current) return;
      pendingSkipRef.current = null;
      void load(tracks, at);
    });
  }

  function removeAt(at: number) {
    if (at < 0 || at >= queue.length || at === index) return;
    const room = roomRef.current.room;
    if (room) {
      const entry = room.queue[at];
      if (entry) roomRef.current.send({ op: 'remove', entryId: entry.entryId });
      return;
    }
    const removed = queue[at];
    // The spare may already hold the song that is leaving; the boundary then loads whatever is next instead.
    if (at === index + 1) {
      clearTransition();
      retireSpare();
    }
    const original = originalQueueRef.current;
    if (original) {
      const at0 = original.findIndex((t) => t.id === removed.id);
      if (at0 >= 0) originalQueueRef.current = original.filter((_, i) => i !== at0);
    }
    setQueue((q) => q.filter((_, i) => i !== at));
    if (at < index) setIndex((i) => i - 1);
  }

  function next() {
    const entry = roomCurrentEntry();
    if (roomRef.current.room) {
      // Names the song seen, so two people skipping at once move one song (the server refuses the second).
      if (entry) roomRef.current.send({ op: 'next', entryId: entry.entryId });
      return;
    }
    if (index < queue.length - 1) return jumpTo(index + 1);
    if (repeat === 'all') return jumpTo(0);
  }

  /** Play, with the short fade in when it's on (A71). Every play button and the lock screen come through here. */
  function resumePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    const room = roomRef.current.room;
    if (room) {
      // The room is already playing but this tab is silent: the browser blocked sound until a tap (a reload, or
      // joining from a link). This tap starts it here only; the room didn't stop.
      if (room.playback.playing) {
        void audio.play().catch(() => {});
        syncRef.current();
      } else {
        roomRef.current.send({ op: 'play' });
      }
      return;
    }
    ++fadeActionRef.current;
    pausingRef.current = false;
    const skip = pendingSkipRef.current;
    if (skip) {
      pendingSkipRef.current = null;
      void load(skip.tracks, skip.at);
      return;
    }
    const fade = canFade && transitionsRef.current.fadeOnPause;
    cancelRamp(audio);
    setFadeGain(audio, fade ? 0 : 1);
    // A broken `src` after a failed reconnect was already reported once.
    void audio
      .play()
      .then(() => {
        if (fade) void rampTo(audio, 1, SHORT_FADE_MS);
      })
      .catch(() => {});
  }

  /** Pause, after the short fade out when it's on. A song still fading out from a crossfade stops at once. */
  function pausePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (roomRef.current.room) {
      roomRef.current.send({ op: 'pause' });
      return;
    }
    const action = ++fadeActionRef.current;
    const skip = pendingSkipRef.current;
    if (skip) {
      // Mid-skip: land on the new song, paused.
      pendingSkipRef.current = null;
      void load(skip.tracks, skip.at, false);
      return;
    }
    if (spareRef.current && !spareRef.current.paused) retireSpare();
    // A boundary planned for this song is re-planned from `timeupdate` after resuming.
    clearTransition();
    if (!canFade || !transitionsRef.current.fadeOnPause) {
      audio.pause();
      return;
    }
    pausingRef.current = true;
    void rampTo(audio, 0, SHORT_FADE_MS).then(() => {
      if (action === fadeActionRef.current && audio === audioRef.current) {
        pausingRef.current = false;
        audio.pause();
      }
    });
  }

  function previous() {
    if (roomRef.current.room) {
      // The server applies the same 3 s restart rule.
      const entry = roomCurrentEntry();
      if (entry) roomRef.current.send({ op: 'previous', entryId: entry.entryId });
      return;
    }
    const audio = audioRef.current;
    if (audio && audio.currentTime > RESTART_THRESHOLD_SECONDS) {
      replanBoundary(audio);
      audio.currentTime = 0;
      // Same reasoning as `seek()`: keep the reconnect anchor from going
      // stale the instant this jump happens.
      if (progressRef.current) progressRef.current.lastTime = 0;
      return;
    }
    if (index > 0) return jumpTo(index - 1);
    if (audio) {
      replanBoundary(audio);
      audio.currentTime = 0;
      if (progressRef.current) progressRef.current.lastTime = 0;
    }
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    const room = roomRef.current.room;
    // In a room, the room's state decides, not this tab's: a tab still waiting for a song's start time is "paused"
    // locally while the room plays.
    const paused = room ? !room.playback.playing || audio.paused : audio.paused;
    if (paused) resumePlayback();
    else pausePlayback();
  }

  /** After a jump within the song: a planned boundary (timer, fade-out) no longer fits, so `timeupdate` re-plans it. */
  function replanBoundary(audio: HTMLAudioElement) {
    if (!transitionRef.current) return;
    clearTransition();
    cancelRamp(audio);
    setFadeGain(audio, 1);
  }

  function seek(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    if (roomRef.current.room) {
      const entry = roomCurrentEntry();
      if (!entry) return;
      const target = Math.min(Math.max(seconds, 0), entry.durationMs / 1000);
      // Shown at once; the audio moves when the room's new state comes back.
      setCurrentTime(target);
      roomRef.current.send({ op: 'seek', entryId: entry.entryId, positionMs: Math.round(target * 1000) });
      return;
    }
    replanBoundary(audio);
    const max = duration || audio.duration || 0;
    const target = Math.min(Math.max(seconds, 0), max);
    audio.currentTime = target;
    // Keep the reconnect point current until the next `timeupdate`, or an error now resumes from before the seek.
    if (progressRef.current) progressRef.current.lastTime = target;
    setCurrentTime(target);
  }

  function cycleRepeat() {
    // A room plays its queue once, the same for everyone.
    if (roomRef.current.room) return;
    setRepeat((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'));
  }

  async function toggleShuffle() {
    if (queue.length < 2 || roomRef.current.room) return;

    if (isShuffled) {
      const restored = originalQueueRef.current ?? queue;
      const at = current ? restored.findIndex((t) => t.id === current.id) : 0;
      setQueue(restored);
      setIndex(at < 0 ? 0 : at);
      setIsShuffled(false);
      return;
    }

    const asked = queue;
    try {
      // Server-side, because avoiding back-to-back artists needs artist ids.
      const { tracks } = await apiClient.post<{ tracks: TrackSummary[] }>('/shuffle', {
        trackIds: queue.map((t) => t.id),
      });
      // Another album or playlist started while this was on its way: its queue isn't the one shuffled.
      if (stateRef.current.queue !== asked) return;

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
    // A skip or pause still fading must not start or touch anything after this.
    ++fadeActionRef.current;
    pendingSkipRef.current = null;
    pausingRef.current = false;
    clearTransition();
    retireSpare();
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load(); // drop the in-flight range request rather than buffering on
    }
    originalQueueRef.current = null;
    moreRef.current = null;
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
    // Closing the player in a room means leaving it too; the others play on.
    if (roomRef.current.room) roomRef.current.leave();
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
  const stateRef = useRef({ queue, index, isPlaying, repeat, dataSaver });
  stateRef.current = { queue, index, isPlaying, repeat, dataSaver };

  const persistState = useCallback(() => {
    const audio = audioRef.current;
    const { queue: tracks, index: at, isPlaying: playing } = stateRef.current;
    if (!audio || !tracks[at]) return;
    // In a room the queue is the room's, not the user's saved personal one.
    if (roomRef.current.room) return;

    // A topped-up queue can outgrow what the server keeps, so a long one is saved as the stretch around the song.
    const start = tracks.length > MAX_SAVED_QUEUE ? Math.min(Math.max(at - 100, 0), tracks.length - MAX_SAVED_QUEUE) : 0;
    const saved = tracks.length > MAX_SAVED_QUEUE ? tracks.slice(start, start + MAX_SAVED_QUEUE) : tracks;

    void apiClient
      .put('/me/playback-state', {
        queue: saved.map((t) => t.id),
        queueIndex: at - start,
        positionSeconds: audio.currentTime,
        playing,
      })
      .catch(() => {
        // Losing a position costs the resume, not the music.
      });
  }, []);

  // Tops the queue up from its source when few songs remain (Q205). Not in a room: the room owns its queue.
  // With endless on, a queue whose own source is used up (or that never had one) carries on as a radio from its
  // last song (A235). Not with repeat on: that queue already never ends. Not while paused either, so a queue restored
  // at page load doesn't fetch a radio nobody asked to hear yet.
  useEffect(() => {
    if (roomRef.current.room || queue.length === 0 || queue.length - index > TOP_UP_AT) return;
    let more = moreRef.current;
    if ((!more || (more.done && !more.radio)) && endless && repeat === 'off' && isPlaying) {
      const last = queue[queue.length - 1];
      more = { fetch: radioSource(last.id, () => stateRef.current.queue.map((queued) => queued.id)), busy: false, done: false, radio: true };
      moreRef.current = more;
    }
    if (!more || more.busy || more.done) return;
    more.busy = true;
    void more
      .fetch()
      .then((tracks) => {
        // Another queue replaced this one while the batch was on its way.
        if (moreRef.current !== more) return;
        if (tracks.length === 0) {
          more.done = true;
          return;
        }
        originalQueueRef.current = [...(originalQueueRef.current ?? stateRef.current.queue), ...tracks];
        setQueue((current) => [...current, ...tracks]);
      })
      .catch(() => {
        // Tried again at the next song change; the queue as it stands still plays.
      })
      .finally(() => {
        more.busy = false;
      });
  }, [queue, index, endless, repeat, isPlaying]);

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
        // In a room (a reload rejoins before this answers), the room's song wins. `audio.src` alone misses a room song
        // still loading: `load` sets it only after building the stream URL.
        if (roomRef.current.room || roomLoadingRef.current || roomEntryRef.current !== null) return;

        originalQueueRef.current = state.queue;
        moreRef.current = null;
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

  /** The index that plays after `at`, or -1 at the end of the queue. */
  function nextIndexFor(length: number, at: number, mode: RepeatMode): number {
    if (mode === 'one') return at;
    if (at < length - 1) return at + 1;
    return mode === 'all' && length > 0 ? 0 : -1;
  }

  /** Gapless unless a fade is set and allowed: not on iOS, not on repeat-one, not inside an album (A72). */
  function transitionKind(track: QueueTrack, next: QueueTrack, mode: RepeatMode): BetweenSongs {
    const prefs = transitionsRef.current;
    if (!canFade || prefs.betweenSongs === 'gapless' || mode === 'one') return 'gapless';
    if (prefs.keepAlbumsGapless && isNextOnAlbum(track, next)) return 'gapless';
    return prefs.betweenSongs;
  }

  /** The spare holds this song, at the quality in use, and hasn't failed. Otherwise a boundary loads it normally. */
  function spareHolds(track: QueueTrack | undefined): boolean {
    const spare = spareRef.current;
    const held = preloadRef.current;
    const quality = stateRef.current.dataSaver ? 'low' : undefined;
    return Boolean(track && spare && held && held.trackId === track.id && held.quality === quality && !spare.error);
  }

  /** Loads the song after this one into the spare, so the boundary only has to press play. */
  async function preloadSpare(track: QueueTrack) {
    const spare = spareRef.current;
    if (!spare) return;
    const quality = stateRef.current.dataSaver ? 'low' : undefined;
    if (spareHolds(track)) return;
    // Still fading out the last song; this boundary falls back to a normal load if it comes first.
    if (!spare.paused) return;
    const url = await buildStreamUrl(track.id, quality);
    if (spare !== spareRef.current || !spare.paused) return;
    cancelRamp(spare);
    levelRef.current.set(spare, track.gainDb);
    setFadeGain(spare, 1);
    spare.src = url;
    spare.load();
    preloadRef.current = { trackId: track.id, quality };
  }

  /**
   * The boundary: the spare becomes the playing element, the old one finishes or fades out. Falls back to a normal
   * load when the spare isn't holding the next song.
   */
  function startNext(kind: BetweenSongs, fadeSeconds: number) {
    const outgoing = audioRef.current;
    const incoming = spareRef.current;
    const { queue: tracks, index: at, repeat: mode } = stateRef.current;
    const nextAt = nextIndexFor(tracks.length, at, mode);
    const nextTrack = tracks[nextAt];
    clearTransition();
    if (!outgoing || !incoming || !nextTrack) return;
    if (!spareHolds(nextTrack)) {
      goTo(nextAt);
      return;
    }

    // An older `load()` still awaiting, or a pending fade action, must not take over the new song.
    const token = ++loadTokenRef.current;
    ++fadeActionRef.current;
    pendingSkipRef.current = null;
    hasStartedRef.current = false;
    setBoundaryCount((n) => n + 1);
    audioRef.current = incoming;
    spareRef.current = outgoing;
    preloadRef.current = null;

    progressRef.current = {
      trackId: nextTrack.id,
      listenedMs: 0,
      lastTime: 0,
      thresholdMs: scrobbleThresholdMs(nextTrack.duration ?? 0),
      scrobbled: false,
    };
    setIndex(nextAt);
    setDuration(
      Number.isFinite(incoming.duration) && incoming.duration > 0 ? incoming.duration : (nextTrack.duration ?? 0),
    );
    setCurrentTime(0);

    cancelRamp(incoming);
    setFadeGain(incoming, kind === 'gapless' ? 1 : 0);
    void incoming
      .play()
      .then(() => {
        if (kind !== 'gapless') void rampTo(incoming, 1, fadeSeconds * 1000);
      })
      .catch((err: unknown) => {
        // A newer load or a pause interrupted this play (`AbortError`); reloading would replace what the user chose.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // The preload looked fine but won't play: the normal path has the compat retry and the reporting.
        if (audioRef.current === incoming && token === loadTokenRef.current) void load(tracks, nextAt);
      });

    // The old element is the spare now; empty it once it has nothing left to play.
    const retireOutgoing = () => {
      if (spareRef.current === outgoing && preloadRef.current === null) retireSpare();
    };
    if (kind === 'crossfade') void rampTo(outgoing, 0, fadeSeconds * 1000).then(retireOutgoing);
    else if (kind === 'gapless') {
      window.clearTimeout(retireTimerRef.current);
      retireTimerRef.current = window.setTimeout(retireOutgoing, 1000);
    }
    else retireOutgoing();
  }

  /** Runs on every `timeupdate` of the playing element: starts the boundary once, in the way the settings ask. */
  function checkBoundary(audio: HTMLAudioElement) {
    // No gapless start or crossfade in a room: the server ends songs, and a fade behind a moving target is where the
    // drift maths gets hard (spec, "Out").
    if (roomRef.current.room) return;
    if (transitionRef.current || audio.paused || pausingRef.current || swappingRef.current) return;
    const { queue: tracks, index: at, repeat: mode } = stateRef.current;
    const track = tracks[at];
    const nextAt = nextIndexFor(tracks.length, at, mode);
    if (!track || nextAt < 0) return;
    const total = audio.duration;
    if (!Number.isFinite(total) || total <= 0) return;

    const remaining = total - audio.currentTime;
    const nextTrack = tracks[nextAt];
    const kind = transitionKind(track, nextTrack, mode);
    // Never a fade longer than a third of either song.
    const fadeSeconds = Math.min(transitionsRef.current.fadeSeconds, total / 3, (nextTrack.duration ?? total) / 3);

    if (kind === 'gapless') {
      if (remaining > GAPLESS_SCHEDULE_S) return;
      // Not preloaded: leave it to `ended`, which loads the next song the old way.
      if (!spareHolds(nextTrack)) {
        transitionRef.current = { kind, fadeSeconds: 0 };
        return;
      }
      const timer = window.setTimeout(
        () => startNext('gapless', 0),
        Math.max(0, (remaining - GAPLESS_LEAD_S) * 1000),
      );
      transitionRef.current = { kind, fadeSeconds: 0, timer };
      return;
    }

    if (remaining > fadeSeconds) return;
    transitionRef.current = { kind, fadeSeconds };
    if (kind === 'crossfade') {
      // Fades over what is actually left, which `timeupdate`'s quarter-second steps can shave a little.
      if (spareHolds(nextTrack)) startNext('crossfade', remaining);
      return;
    }
    // Fade out, then in: this song fades over what's left; `ended` starts the next one fading in.
    void rampTo(audio, 0, remaining * 1000);
  }

  /** The playing element ran out. A planned boundary that didn't start yet starts now; otherwise the old way. */
  function handleEnded() {
    const roomNow = roomRef.current;
    if (roomNow.room) {
      // The server ends songs in a room and its next state is moments away. Only with the connection down does this
      // tab move on alone, to the next song in the queue it last saw (spec, "The 30-second test").
      if (roomNow.connection === 'live') return;
      const at = stateRef.current.index;
      const nextEntry = roomNow.room.queue[at + 1];
      if (nextEntry) {
        roomEntryRef.current = nextEntry.entryId;
        goTo(at + 1);
      }
      return;
    }
    const { queue: tracks, index: at, repeat: mode } = stateRef.current;
    const pending = transitionRef.current;
    clearTransition();
    const nextAt = nextIndexFor(tracks.length, at, mode);

    // Ran out while a pause was fading: the pause wins, on the next song.
    if (pausingRef.current) {
      pausingRef.current = false;
      if (nextAt >= 0) {
        setIndex(nextAt);
        void load(tracks, nextAt, false);
      } else {
        setIsPlaying(false);
      }
      return;
    }

    if (nextAt >= 0 && spareHolds(tracks[nextAt])) {
      if (pending?.kind === 'fadeOutIn') startNext('fadeOutIn', pending.fadeSeconds);
      else startNext('gapless', 0);
      return;
    }
    if (mode === 'one') {
      void load(tracks, at);
      return;
    }
    if (nextAt >= 0) {
      goTo(nextAt);
      return;
    }
    setIsPlaying(false);
  }

  /** The room's queue as player tracks. */
  function roomQueueTracks(room: RoomState): QueueTrack[] {
    return room.queue.map((e) => ({
      id: e.trackId,
      title: e.title,
      artist: e.artist,
      duration: e.durationMs / 1000,
      albumId: e.albumId,
      gainDb: e.gainDb,
      addedBy: { userId: e.addedBy, name: e.addedByName ?? '', avatarId: e.addedByAvatarId ?? null },
    }));
  }

  /** Play pressed in a room: once the server has added the songs, jump to the one picked. */
  function runPendingRoomJump(room: RoomState) {
    const pending = pendingRoomJumpRef.current;
    if (!pending) return;
    if (Date.now() - pending.at > ROOM_PENDING_JUMP_MS) {
      pendingRoomJumpRef.current = null;
      return;
    }
    const start =
      pending.afterEntryId === undefined ? 0 : room.queue.findIndex((e) => e.entryId === pending.afterEntryId) + 1;
    const target = start > 0 || pending.afterEntryId === undefined ? room.queue[start + pending.offset] : undefined;
    if (!target || target.trackId !== pending.trackId || target.addedBy !== roomRef.current.you) return;
    pendingRoomJumpRef.current = null;
    roomRef.current.send({ op: 'jump', entryId: target.entryId });
  }

  /**
   * Makes this tab match the room: the right song, playing or paused, at the right position. Runs on every room state
   * and once a second. The formula and thresholds are the spec's ("Model", "Drift"); the server's clock comes from
   * `RoomClient.serverNow()`.
   */
  function syncToRoom() {
    const { room, connection, serverNow } = roomRef.current;
    const audio = audioRef.current;
    if (!room || !audio) return;
    // Disconnected: carry on alone from the last state; `handleEnded` moves to the next song.
    if (connection !== 'live') return;

    const key = room.queue.map((e) => e.entryId).join(',');
    if (key !== roomQueueKeyRef.current) {
      roomQueueKeyRef.current = key;
      roomTracksRef.current = roomQueueTracks(room);
      originalQueueRef.current = roomTracksRef.current;
      moreRef.current = null;
      setIsShuffled(false);
      setQueue(roomTracksRef.current);
    }
    runPendingRoomJump(room);

    const entry = room.queue[room.current];
    if (!entry) {
      window.clearTimeout(roomStartTimerRef.current);
      if (!audio.paused) audio.pause();
      return;
    }
    if (stateRef.current.index !== room.current) setIndex(room.current);

    const expected = expectedPositionMs(room, serverNow());
    if (roomEntryRef.current !== entry.entryId) {
      roomEntryRef.current = entry.entryId;
      window.clearTimeout(roomStartTimerRef.current);
      driftStrikesRef.current = 0;
      const local = stateRef.current.queue[stateRef.current.index];
      // Starting a room from what's playing: the song is already loaded, so the drift rule below lines it up instead
      // of a reload.
      const alreadyLoaded = local?.id === entry.trackId && audio.src !== '' && !roomLoadingRef.current;
      if (!alreadyLoaded) {
        roomLoadingRef.current = true;
        const seq = ++roomLoadSeqRef.current;
        void load(roomTracksRef.current, room.current, false, Math.max(0, expected) / 1000).finally(() => {
          if (seq !== roomLoadSeqRef.current) return;
          roomLoadingRef.current = false;
          syncRef.current();
        });
        return;
      }
    }
    if (roomLoadingRef.current) return;

    const moveTo = (ms: number) => {
      audio.currentTime = ms / 1000;
      // A correction, not listening: keep it out of the scrobble count.
      if (progressRef.current) progressRef.current.lastTime = ms / 1000;
    };

    if (!room.playback.playing) {
      window.clearTimeout(roomStartTimerRef.current);
      lastDriftRef.current = null;
      if (!audio.paused) audio.pause();
      if (Math.abs(audio.currentTime * 1000 - room.playback.positionMs) >= ROOM_DRIFT_LIMIT_MS) {
        moveTo(room.playback.positionMs);
      }
      return;
    }

    if (expected < 0) {
      // A new song's start time is still ahead: wait at the start and go on the dot.
      if (!audio.paused) audio.pause();
      if (audio.currentTime > 0) moveTo(0);
      window.clearTimeout(roomStartTimerRef.current);
      roomStartTimerRef.current = window.setTimeout(() => syncRef.current(), -expected);
      return;
    }
    // Past the end: the server is about to move everyone on.
    if (expected >= entry.durationMs) return;

    if (audio.paused) {
      moveTo(expected + seekLeadRef.current);
      afterCorrectionRef.current = true;
      driftStrikesRef.current = 0;
      // Rejected when the browser wants a tap first (after a reload); the play button does that (`resumePlayback`).
      void audio.play().catch(() => {});
      return;
    }

    const drift = audio.currentTime * 1000 - expected;
    lastDriftRef.current = Math.round(drift);
    if (afterCorrectionRef.current && !isBufferingRef.current) {
      // How far the last start or jump landed from where it should: aim that much further ahead next time.
      afterCorrectionRef.current = false;
      if (Math.abs(drift) < 2000) seekLeadRef.current = Math.min(Math.max(seekLeadRef.current - drift, 0), 1000);
    }
    if (Math.abs(drift) < ROOM_DRIFT_LIMIT_MS) {
      driftStrikesRef.current = 0;
      return;
    }
    // Two readings in a row, so one bad reading doesn't cause a jump.
    driftStrikesRef.current += 1;
    if (driftStrikesRef.current >= 2) {
      moveTo(expected + seekLeadRef.current);
      afterCorrectionRef.current = true;
      driftStrikesRef.current = 0;
    }
  }

  // The mount-time listeners call these through refs, so they always see this render's values.
  boundaryRef.current = checkBoundary;
  endedRef.current = handleEnded;
  syncRef.current = syncToRoom;

  // Follow the room on every new state and on reconnect, then once a second for drift, reported every 5 s for the
  // Control Center monitor.
  const roomVersion = roomCtx.room?.version;
  const roomConnection = roomCtx.connection;
  useEffect(() => {
    syncRef.current();
  }, [roomVersion, roomConnection]);

  useEffect(() => () => window.clearTimeout(retireTimerRef.current), []);

  useEffect(() => {
    if (!inRoom) {
      // Left: forget the room's song so the next room starts clean. The music plays on here, on its own.
      roomEntryRef.current = null;
      roomQueueKeyRef.current = '';
      pendingRoomJumpRef.current = null;
      lastDriftRef.current = null;
      window.clearTimeout(roomStartTimerRef.current);
      return;
    }
    const tick = window.setInterval(() => syncRef.current(), 1000);
    const report = window.setInterval(
      () => roomRef.current.reportStatus(lastDriftRef.current, isBufferingRef.current),
      5000,
    );
    return () => {
      window.clearInterval(tick);
      window.clearInterval(report);
    };
  }, [inRoom]);

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

  // Latest-render closure, so the press counter (created once) always acts on the current queue and position.
  const headsetRunRef = useRef<(action: HeadsetAction) => void>(() => {});
  headsetRunRef.current = (action) => {
    switch (action) {
      case 'playPause':
        return toggle();
      case 'next':
        return next();
      case 'previous':
        return previous();
      case 'seekForward':
        return seek(currentTime + HEADSET_SEEK_SECONDS);
      case 'seekBack':
        return seek(currentTime - HEADSET_SEEK_SECONDS);
      case 'none':
        return;
    }
  };
  // Same idea for the OS media keys and the keyboard: their effects bind once per track, not on every `timeupdate`.
  // Re-binding on each tick cleared every media-session handler for an instant, so a lock-screen press could land nowhere.
  const transportRef = useRef({ currentTime, seek, stop, toggle, next, previous });
  transportRef.current = { currentTime, seek, stop, toggle, next, previous };
  const pressesRef = useRef<ReturnType<typeof createPressCounter> | null>(null);
  if (!pressesRef.current) {
    pressesRef.current = createPressCounter(loadHeadsetPrefs, (action) => headsetRunRef.current(action));
  }
  useEffect(() => () => pressesRef.current?.cancel(), []);

  // Separate from the metadata: these handlers bind while a track is loaded and read the latest state through refs.
  const hasCurrent = current !== null;
  useEffect(() => {
    if (!('mediaSession' in navigator) || !hasCurrent) return;
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
    // A headset sends play or pause for its main button, whichever the browser thinks is next, so both count as one
    // press. What a press does is the user's choice (Options > Headset buttons).
    set('play', () => pressesRef.current?.press());
    set('pause', () => pressesRef.current?.press());
    set('previoustrack', () => headsetRunRef.current(loadHeadsetPrefs().previousButton));
    set('nexttrack', () => headsetRunRef.current(loadHeadsetPrefs().nextButton));
    set('seekbackward', (d) => {
      const t = transportRef.current;
      t.seek(t.currentTime - (d.seekOffset ?? SEEK_STEP_SECONDS));
    });
    set('seekforward', (d) => {
      const t = transportRef.current;
      t.seek(t.currentTime + (d.seekOffset ?? SEEK_STEP_SECONDS));
    });
    set('seekto', (d) => {
      if (typeof d.seekTime === 'number') transportRef.current.seek(d.seekTime);
    });
    set('stop', () => transportRef.current.stop());

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
  }, [hasCurrent]);

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

  // Converts the next track while this one plays, after a delay so skipping doesn't start one per track, then loads it
  // into the spare element for the boundary (A56). Repeat-one preloads the same song again.
  const upNext =
    repeat === 'one' ? null : (queue[index + 1] ?? (repeat === 'all' && queue.length > 1 ? queue[0] : null));
  const spareTarget = repeat === 'one' ? current : upNext;

  useEffect(() => {
    if (!current || !spareTarget) return;
    const timer = setTimeout(() => {
      if (upNext) prepareTrack(upNext.id, dataSaver ? 'low' : undefined);
      void preloadSpare(spareTarget);
    }, PREPARE_NEXT_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, spareTarget?.id, dataSaver, boundaryCount]);

  // Keyboard transport. Ignored while typing, so the library search box and
  // the tag editor keep working normally.
  useEffect(() => {
    if (!hasCurrent) return;
    function onKeyDown(ev: KeyboardEvent) {

      const target = ev.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // Browser and OS shortcuts (Ctrl+P prints), and keys a focused control already uses: Space presses a button,
      // arrows move a slider.
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (target?.closest('button, a[href], [role="slider"], [role="button"]')) return;

      const t = transportRef.current;

      switch (ev.key) {
        case ' ':
          ev.preventDefault();
          t.toggle();
          break;
        case 'ArrowLeft':
          ev.preventDefault();
          t.seek(t.currentTime - SEEK_STEP_SECONDS);
          break;
        case 'ArrowRight':
          ev.preventDefault();
          t.seek(t.currentTime + SEEK_STEP_SECONDS);
          break;
        case 'n':
          t.next();
          break;
        case 'p':
          t.previous();
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasCurrent]);

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
    startRadio,
    endless,
    setEndless,
    toggle,
    next,
    previous,
    // Picking a queue row is a user's skip, so it gets the short fade.
    goTo: jumpTo,
    removeAt,
    seek,
    cycleRepeat,
    toggleShuffle,
    setDataSaver,
    setVolume,
    toggleMute,
    stop: stopAndForget,
    transitions,
    setTransitions,
    canFade,
    inRoom,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}

      {/* Phone: a strip that opens the full view. The bar below is the same
          player at a size that only works with a mouse and a wide window. */}
      {user && current && !onAttractScreen && !isSheetOpen && (
        <div className="player-deck deck-rise no-sweep fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 px-4 py-2.5 md:hidden">
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5 origin-left bg-orange-600"
            style={{
              transform: `scaleX(${effectiveDuration ? currentTime / effectiveDuration : 0})`,
              transition: 'transform 300ms linear',
            }}
          />
          {/* Sibling buttons: a control inside a control is invalid. */}
          <button
            onClick={() => setIsExpanded(true)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-label={`Now playing: ${current.title}. Open the player.`}
          >
            <span key={current.id} className={`${swapClass} flex min-w-0 flex-1 items-center gap-3`}>
            <CoverArt kind="tracks" id={current.id} className="h-10 w-10 shrink-0 rounded-md" alt="" />
            <span className="min-w-0 flex-1">
              <span className="player-title block truncate text-sm text-white">{current.title}</span>
              <span className="block truncate text-xs text-blue-300">
                {roomCtx.room && (
                  <span className={roomCtx.connection === 'live' ? 'text-orange-400' : 'text-blue-400'}>
                    {roomCtx.connection === 'live' ? `Room ${roomCtx.room.code}` : 'Reconnecting…'} ·{' '}
                  </span>
                )}
                {current.artist ?? 'Unknown Artist'}
              </span>
            </span>
            </span>
          </button>
          <button
            onClick={toggle}
            disabled={isLoading}
            className={`player-play-btn pulse-ring h-10 w-10 shrink-0 ${isPlaying ? 'is-playing' : ''}`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            <span key={isPlaying ? 'pause' : 'play'} className="icon-swap">
              {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
            </span>
          </button>
        </div>
      )}

      <Presence value={user && current && !onAttractScreen && isSheetOpen ? value : null} exitMs={240}>
        {(player) => <NowPlaying player={player} onCollapse={() => setIsExpanded(false)} />}
      </Presence>

      <Presence value={user && current && !onAttractScreen && isDesktopViewOpen ? value : null} exitMs={240}>
        {(player) => <DesktopNowPlaying player={player} onClose={() => setIsExpanded(false)} />}
      </Presence>

      {user && current && !onAttractScreen && (
        <div className="player-deck deck-rise fixed inset-x-0 bottom-0 z-40 hidden md:block">
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
                ) : (
                  <span key={isPlaying ? 'pause' : 'play'} className="icon-swap">
                    {isPlaying ? <PauseIcon className="h-4.5 w-4.5" /> : <PlayIcon className="h-4.5 w-4.5" />}
                  </span>
                )}
              </button>
              <button
                onClick={next}
                className="player-transport-btn h-9 w-9"
                aria-label={roomCtx.room ? roomNextLabel(roomCtx.room, roomCtx.you) : 'Next track'}
                title={roomCtx.room ? `${roomNextLabel(roomCtx.room, roomCtx.you)} (N)` : 'Next (N)'}
              >
                <SkipForwardIcon className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => setIsExpanded((open) => !open)}
              className="shrink-0 rounded-md transition-transform duration-200 ease-[var(--ease-spring)] hover:scale-105 active:scale-95"
              aria-label="Full player"
                aria-expanded={isDesktopViewOpen}
              title={isDesktopViewOpen ? 'Close the full player' : 'Open the full player'}
            >
              <CoverArt key={current.id} kind="tracks" id={current.id} className={`h-11 w-11 ${swapClass}`} alt="" />
            </button>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span key={current.id} className={`${swapClass} flex min-w-0 items-baseline gap-2`}>
                  <span className="player-title truncate text-base text-white">{current.title}</span>
                  <span className="truncate text-xs text-blue-300">{current.artist ?? 'Unknown Artist'}</span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs">
                  {/* The one accent in this row while in a room: it explains why shuffle and repeat are off. */}
                  {roomCtx.room && (
                    <Link
                      to="/together"
                      className={roomCtx.connection === 'live' ? 'text-orange-400 hover:text-orange-300' : 'text-blue-400'}
                      title="Listen together: open the room"
                    >
                      {roomCtx.connection === 'live' ? `Room ${roomCtx.room.code}` : 'Reconnecting…'}
                    </Link>
                  )}
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
                      <span key={index} className="motion-bump">
                        {index + 1}
                      </span>
                      /{queue.length}
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
                disabled={queue.length < 2 || inRoom}
                className={`player-pill h-9 w-9 ${isShuffled ? 'is-active' : ''}`}
                aria-pressed={isShuffled}
                aria-label="Shuffle"
                title={inRoom ? 'Shuffle is off in a room' : 'Smart shuffle: avoids the same artist back-to-back'}
              >
                <ShuffleIcon className="h-4 w-4" />
              </button>
              <button
                onClick={cycleRepeat}
                disabled={inRoom}
                className={`player-pill h-9 w-9 ${repeat !== 'off' ? 'is-active' : ''}`}
                aria-label={`Repeat: ${repeat}`}
                title={inRoom ? 'Repeat is off in a room' : `Repeat: ${repeat}`}
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
              <button
                onClick={() => setIsExpanded((open) => !open)}
                className="player-pill h-9 w-9 ml-1"
                aria-label="Full player"
                aria-expanded={isDesktopViewOpen}
                title={isDesktopViewOpen ? 'Close the full player' : 'Open the full player'}
              >
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform duration-300 ease-[var(--ease-spring)] ${isDesktopViewOpen ? '' : 'rotate-180'}`}
                />
              </button>
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
