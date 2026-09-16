import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/BrandLockup';
import { TitleScreenPanel } from '../components/TitleScreenPanel';
import { useThemeCycle } from '../hooks/useThemeCycle';
import { apiClient } from '../lib/apiClient';
import { clearAtTitle, isAtTitle, markJustEntered } from '../lib/boot';
import { arrivalDuration } from '../lib/interstitial';
import { ArrivalVeil } from '../components/ArcadeInterstitial';

/**
 * How long the shut-off runs. Must match `--exit` in `index.css`; it lives in
 * both places because CSS drives the animation and JS decides when the route
 * changes, and the two have to agree or the screen either cuts early or holds
 * on black after the picture has gone.
 */
const EXIT_MS = 820;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reduced motion has to be asked about here as well as in CSS. The stylesheet
 * can stop the picture moving, but only this side decides how long the route
 * change waits — and holding someone on a still screen for 820ms is worse than
 * the animation they asked not to see.
 */
function exitDuration(): number {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : EXIT_MS;
}

/**
 * The wordmark at poster scale. Clamped against **both** axes on purpose: a
 * phone held sideways has plenty of width and almost no height, and sizing on
 * `vw` alone pushes the enter button off the bottom of exactly the screen this
 * app is meant to be used on.
 *
 * The `vw` figure is set by the longest thing it has to fit rather than by
 * taste: `brainlessmusic` plus the mark measures about 6.6x the font size, and
 * the band's 6% margins leave 88% of the viewport — so anything above ~13vw
 * runs the `c` into the right edge on a 390px phone. 11.5 leaves it a margin
 * that still looks deliberate.
 */
const TITLE_SIZE = 'clamp(1.9rem, min(11.5vw, 16vh), 8rem)';

/** A token handed over from another device, if this is a handoff link. */
function tokenFromHash(): string | null {
  const match = /(?:^|[#&])t=([^&]+)/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The corner readouts. The reference screens carry `VER:JA`, `GAME LEVEL` and
 * `FREE PLAY` in their corners; these say true things instead of decorative
 * ones, so the title screen doubles as the answer to "is the server up".
 */
function TitleHud() {
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
      <span className="absolute left-4 top-4 sm:left-6 sm:top-6">VER {__APP_VERSION__}</span>
      <span className="absolute right-4 top-4 sm:right-6 sm:top-6">
        SERVER{' '}
        <span className={server === 'OK' ? 'text-blue-200' : 'text-orange-400'}>{server}</span>
      </span>
      <span className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6">GUEST ENTRY</span>
      <span className="absolute bottom-4 right-4 hidden sm:bottom-6 sm:right-6 sm:inline">
        SELF-HOSTED
      </span>
    </div>
  );
}

export function TitleScreenPage() {
  const { user, adoptToken } = useAuth();
  const navigate = useNavigate();
  useThemeCycle();

  const [isEntering, setIsEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  // Read during the first render rather than in an effect, so the screen never
  // paints the ordinary enter button for a frame before switching.
  const [handoff, setHandoff] = useState<string | null>(tokenFromHash);

  /**
   * The black lifting off this screen after an Exit.
   *
   * `AppShell` renders its own veil for navigations *within* the app, but
   * `/enter` lives outside the shell — so the shell unmounts on the way here
   * and takes its veil with it, and the title screen was the one destination
   * that still cut in hard at the end of the sequence. The veil belongs to
   * whoever is arriving, and here that is this page.
   *
   * Read from the same flag the redirect above uses, so it plays exactly when
   * an Exit brought you here and never on a cold load.
   */
  const [arriving, setArriving] = useState(() => isAtTitle() && arrivalDuration() > 0);

  useEffect(() => {
    if (!arriving) return;
    const done = setTimeout(() => setArriving(false), arrivalDuration());
    return () => clearTimeout(done);
  }, [arriving]);

  // Stripped from the address bar immediately — a token in a URL is a
  // credential in a URL, and it should not survive a screenshot, the back
  // button, or being read over someone's shoulder.
  useEffect(() => {
    if (!window.location.hash) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  // A signed-in visitor landing here directly (a stale bookmark, a typed URL)
  // belongs in the app, not on the attract screen — Exit is the only door out
  // of a session now, so nobody reaches `/enter` with a session still open on
  // purpose. `!isLeaving` is what lets `acceptHandoff` play its own exit
  // animation below: it sets `user` by succeeding, and without this gate the
  // redirect would fire on the animation's first frame and cut it short.
  if (user && !isLeaving) return <Navigate to="/" replace />;

  /**
   * Nothing is minted here — the choice between signing in and continuing as
   * a guest hasn't been made yet, so this only plays the CRT exit and hands
   * off to the account-select screen, where it's actually made.
   */
  async function handleEnter(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setIsEntering(true);
    setIsLeaving(true);

    await delay(exitDuration());
    navigate('/enter/profile', { replace: true });
  }

  async function acceptHandoff() {
    if (!handoff) return;
    setError(null);
    setIsEntering(true);
    setIsLeaving(true);

    try {
      await Promise.all([adoptToken(handoff), delay(exitDuration())]);
      clearAtTitle();
      markJustEntered();
      navigate('/', { replace: true });
    } catch {
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
      <TitleHud />

      {/* The content band: solid white where the type sits, dissolving to the
          right so the mosaic behind shows through instead of being cut off by
          a hard edge. */}
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
                  browser was — anything favorited here is not merged across.
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
                {/* One instruction, the way the reference has one. Big enough
                    for a thumb (min-h-14), full width on a phone, and its
                    blink never reaches invisible — a control you cannot see is
                    a control you cannot press. */}
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

            <p className="mt-4 text-xs text-blue-950/45">
              Sign in, or continue as a guest, on the next screen.
            </p>
          </div>
        </div>
      </div>

      {/* The logo does not collapse with the band — it carries on toward the
          camera. Doing that means a second copy on its own layer: nesting a
          zoom inside an element that is being squashed to a line squashes the
          zoom with it, and no amount of transform maths untangles the two.
          Laid out identically to the real one, so it starts exactly where the
          real one was standing and there is no jump on the first frame. */}
      {isLeaving && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex min-h-[58%] -translate-y-1/2 items-center py-8"
        >
          {/* No text colour class here on purpose — `logo-approach` owns the
              colour, because it has to change partway through the zoom as the
              white band collapses out from under the type. The mark's ring
              takes `currentColor` for the same reason. */}
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

      {/* Ends on black and holds there until the next screen paints. Without
          it the app flashes through whatever the body colour is at the moment
          the route changes. */}
      {isLeaving && (
        <div aria-hidden className="title-exit-blackout pointer-events-none absolute inset-0 z-30 bg-black" />
      )}

      {arriving && <ArrivalVeil />}
    </div>
  );
}
