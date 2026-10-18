import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandLockup';
import { TitleScreenPanel } from '../components/TitleScreenPanel';
import { useThemeCycle } from '../hooks/useThemeCycle';
import { apiClient } from '../lib/apiClient';
import { clearAtTitle, consumeJustEntered, isAtTitle, markJustEntered } from '../lib/boot';
import { arrivalDuration } from '../lib/interstitial';
import { THEMES, type ThemeId } from '../lib/theme';
import { ArrivalVeil } from '../components/ArcadeInterstitial';
import { ChangelogDialog } from '../components/ChangelogDialog';

/** The shut-off length. Must match `--exit` in `index.css`. */
const EXIT_MS = 820;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reduced motion skips the wait too; holding a still screen for 820ms is worse than the animation. */
function exitDuration(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS;
}

/** Clamped on both axes so a sideways phone keeps the button on screen. 11.5vw fits the ~6.6em lockup on a 390px phone. */
const TITLE_SIZE = 'clamp(1.9rem, min(11.5vw, 16vh), 8rem)';

/** A token handed over from another device, if this is a handoff link. */
function tokenFromHash(): string | null {
  const match = /(?:^|[#&])t=([^&]+)/.exec(window.location.hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Corner readouts, like the reference's `FREE PLAY`, but saying true things. */
function TitleHud({ theme }: { theme: ThemeId }) {
  const { data, isError, isLoading } = useQuery({
    queryKey: ['health-ping'],
    queryFn: () => apiClient.get<{ status: string }>('/health'),
    retry: false,
    refetchInterval: 30_000,
  });

  const server = isLoading ? 'CHECKING' : isError || data?.status !== 'ok' ? 'UNREACHABLE' : 'OK';

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 p-4 font-mono text-[0.6rem] tracking-[0.2em] text-blue-300/70 sm:p-6 sm:text-[0.65rem]"
    >
      <span className="absolute right-4 top-4 sm:right-6 sm:top-6">
        SERVER{' '}
        <span
          className={
            server === 'OK' ? 'text-emerald-300' : server === 'CHECKING' ? 'text-amber-300' : 'text-red-200'
          }
        >
          {server}
        </span>
      </span>
      <span className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6">
        THEME {THEMES.find((t) => t.id === theme)?.name.toUpperCase()}
      </span>
      <span className="absolute bottom-4 right-4 hidden sm:bottom-6 sm:right-6 sm:inline">
        SELF-HOSTED
      </span>
    </div>
  );
}

export function TitleScreenPage() {
  const { user, adoptToken } = useAuth();
  const navigate = useNavigate();
  const theme = useThemeCycle();

  const [showChangelog, setShowChangelog] = useState(false);
  // Stable, so the dialog's Escape listener isn't re-bound every render.
  const versionRef = useRef<HTMLButtonElement>(null);
  const closeChangelog = useCallback(() => {
    setShowChangelog(false);
    // Back where the keyboard was, not the top of the page.
    versionRef.current?.focus();
  }, []);
  const [isEntering, setIsEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  // Read during the first render rather than in an effect, so the screen never
  // paints the ordinary enter button for a frame before switching.
  const [handoff, setHandoff] = useState<string | null>(tokenFromHash);

  /** The veil after an Exit. The title screen is outside the shell, so it plays its own; never on a cold load. */
  const [arriving, setArriving] = useState(() => isAtTitle() && arrivalDuration() > 0);

  useEffect(() => {
    if (!arriving) return;
    const done = setTimeout(() => setArriving(false), arrivalDuration());
    return () => clearTimeout(done);
  }, [arriving]);

  // A token in a URL is a credential; strip it at once.
  useEffect(() => {
    if (!window.location.hash) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  // A signed-in visitor belongs in the app. `!isLeaving` lets `acceptHandoff` finish its exit animation first.
  if (user && !isLeaving) return <Navigate to="/" replace />;

  /** Plays the exit to account select; nothing is minted until a choice is made there. */
  async function handleEnter(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setIsEntering(true);
    setIsLeaving(true);

    await delay(exitDuration());
    navigate('/login', { replace: true });
  }

  async function acceptHandoff() {
    if (!handoff) return;
    setError(null);
    setIsEntering(true);
    setIsLeaving(true);

    // The title screen is `/` while signed out, so the app replaces it the moment `user` is set: finish the exit first,
    // and mark the entry before signing in, since the shell reads the mark as it mounts.
    await delay(exitDuration());
    clearAtTitle();
    markJustEntered();
    try {
      await adoptToken(handoff);
      navigate('/', { replace: true });
    } catch {
      consumeJustEntered();
      setIsLeaving(false);
      setError('That link has expired, or is not valid any more.');
      setHandoff(null);
    } finally {
      setIsEntering(false);
    }
  }

  return (
    <div className="app-ground relative min-h-screen overflow-hidden">
      <TitleScreenPanel className={isLeaving ? 'title-exit-panel' : undefined} />
      <TitleHud theme={theme} />
      {/* Outside the HUD, which is aria-hidden and click-through: this one opens What's new (owner request,
          2026-10-11). Same readout look; full-strength colour, since it's a control and must clear 4.5:1. */}
      <button
        ref={versionRef}
        onClick={() => setShowChangelog(true)}
        className="absolute left-2 top-2 z-30 rounded px-2 py-1.5 font-mono text-[0.6rem] tracking-[0.2em] text-blue-300 underline decoration-dotted underline-offset-4 transition-colors hover:text-white sm:left-4 sm:top-4 sm:text-[0.65rem]"
        aria-label={`Version ${__APP_VERSION__}. See what's new`}
        title="What's new"
      >
        VER {__APP_VERSION__}
      </button>
      {showChangelog && <ChangelogDialog onClose={closeChangelog} />}

      {/* The content band: white under the type, dissolving to the right into the mosaic. */}
      <div
        className={`title-band absolute inset-x-0 top-1/2 z-10 flex min-h-[58%] -translate-y-1/2 items-center py-8 ${
          isLeaving ? 'title-exit-band' : ''
        }`}
      >
        <span className="band-sweep band-sweep-top" />
        <span className="band-sweep band-sweep-bottom" />

        <div className="title-entrance w-full px-[6%] md:pl-[8%]">
          <p className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-blue-950/50 sm:text-xs">
            Self-hosted · Personal audio
          </p>

          <h1
            className="title-sheen-host font-brand font-bold leading-[0.95] tracking-tight text-blue-950 select-none"
            style={{ fontSize: TITLE_SIZE }}
          >
            <span className="inline-flex items-center gap-[0.12em]">
              <BrandMark className="h-[0.62em] w-[0.62em] border-[0.055em] border-blue-950" />
              <span className="relative inline-block">
                <span className="title-sheen-text">
                  brainless<span className="text-orange-600">music</span>
                </span>
              </span>
            </span>
          </h1>

          <div className="mt-7 max-w-sm sm:mt-9">
            {handoff ? (
              <>
                <p className="mb-3 text-sm text-blue-950/70">
                  This link carries another device's listening history. Taking it over{' '}
                  <strong className="font-semibold text-blue-950">replaces</strong> whatever this
                  browser was. Anything favorited here is not merged across.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={acceptHandoff}
                    disabled={isEntering}
                    className="btn-primary btn-md min-h-14 flex-1 text-base"
                  >
                    {isEntering ? 'Taking over…' : 'Continue here'}
                  </button>
                  <button
                    onClick={() => setHandoff(null)}
                    className="btn-secondary btn-md min-h-14"
                  >
                    No thanks
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleEnter}>
                {/* The one instruction. Thumb-sized, full width on a phone; the blink never goes invisible. */}
                <button
                  type="submit"
                  disabled={isEntering}
                  className="btn-primary btn-md enter-blink min-h-14 w-full text-base font-semibold uppercase tracking-[0.15em] sm:w-auto sm:px-10"
                >
                  {isEntering ? 'Entering…' : 'Click here to enter'}
                </button>
              </form>
            )}

            {error && (
              <p className="mt-3 rounded-md bg-red-700 px-3 py-2 text-sm text-white">{error}</p>
            )}

            <p className="mt-4 text-xs text-blue-950/70">
              Your own library, streamed from this server.
            </p>
          </div>
        </div>
      </div>

      {/* A second copy of the logo on its own layer, zooming at the camera: inside the squashing band it would squash too. */}
      {isLeaving && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex min-h-[58%] -translate-y-1/2 items-center py-8"
        >
          {/* No colour class: `logo-approach` owns the colour as the band collapses. */}
          <div className="title-exit-logo w-full px-[6%] md:pl-[8%]">
            <span
              className="font-brand font-bold leading-[0.95] tracking-tight"
              style={{ fontSize: TITLE_SIZE }}
            >
              <span className="inline-flex items-center gap-[0.12em]">
                <BrandMark className="h-[0.62em] w-[0.62em] border-[0.055em] border-current" />
                <span>
                  brainless<span className="text-orange-600">music</span>
                </span>
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Holds black until the next screen paints. */}
      {isLeaving && (
        <div aria-hidden className="title-exit-blackout pointer-events-none absolute inset-0 z-30 bg-black" />
      )}

      {arriving && <ArrivalVeil />}
    </div>
  );
}
