import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AdminNumpad } from '../components/AdminNumpad';
import { BrandMark } from '../components/BrandLockup';
import { TitleScreenPanel } from '../components/TitleScreenPanel';
import { useSecretTaps } from '../hooks/useSecretTaps';
import { ApiError, apiClient } from '../lib/apiClient';
import { clearAtTitle, isAtTitle, markJustEntered } from '../lib/boot';

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
  const { user, enterAsGuest, adoptToken } = useAuth();
  const navigate = useNavigate();

  const [isEntering, setIsEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const [showNumpad, setShowNumpad] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  // Read during the first render rather than in an effect, so the screen never
  // paints the ordinary enter button for a frame before switching.
  const [handoff, setHandoff] = useState<string | null>(tokenFromHash);
  // Whether the header's Exit sent us here on purpose. Read once and held,
  // not re-read: `clearAtTitle` runs while this screen is still animating
  // away, and a live read would flip the gate below mid-exit and cut it.
  const [heldAtTitle] = useState(isAtTitle);

  // Stripped from the address bar immediately — a token in a URL is a
  // credential in a URL, and it should not survive a screenshot, the back
  // button, or being read over someone's shoulder.
  useEffect(() => {
    if (!window.location.hash) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  const openNumpad = useCallback(() => setShowNumpad(true), []);
  const countTap = useSecretTaps(openNumpad);

  // Bumped on every tap. Used as a `key`, so the flash remounts and replays —
  // the only way to retrigger a one-shot CSS animation without reaching for a
  // forced reflow.
  const [taps, setTaps] = useState(0);

  function onLogoTap() {
    setTaps((n) => n + 1);
    countTap();
  }

  // Held while leaving. `enterAsGuest` sets `user`, and without this gate the
  // redirect would fire on the animation's first frame and cut it — the
  // navigation is done by hand below, once the picture has actually gone.
  //
  // `heldAtTitle` is the other exemption: the redirect is here so a signed-in
  // tab cannot land on the attract screen by accident, which makes arriving
  // deliberately the one case it gets wrong. Exit sets the flag, and this is
  // where it is honoured.
  if (user && !isLeaving && !heldAtTitle) return <Navigate to="/" replace />;

  // Someone who exited and is on their way back in. They already have a token,
  // so there is nothing to mint — only the animation to play.
  const isReturning = Boolean(user);

  async function handleEnter(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setIsEntering(true);
    setIsLeaving(true);

    try {
      // Deliberately concurrent. Awaiting the mint first would leave the button
      // reading "Entering…" for a whole round trip before anything moved, which
      // reads as a hang on exactly the slow connection the animation exists to
      // cover. Run together, the slower of the two decides when the app
      // appears — on a LAN that is always the animation, so the timing is
      // predictable rather than network-dependent.
      await Promise.all([
        isReturning ? Promise.resolve() : enterAsGuest(needsCode ? code : undefined),
        delay(exitDuration()),
      ]);
      clearAtTitle();
      markJustEntered();
      navigate('/', { replace: true });
    } catch (err) {
      // Come back. Animating away and *then* discovering the server said no is
      // the one outcome this sequence must never produce.
      setIsLeaving(false);
      // A 401 on the first press is how the client learns this server wants a
      // code — the server does not advertise it, and does not need to.
      if (err instanceof ApiError && err.status === 401) {
        setNeedsCode(true);
        setError(needsCode ? 'That code is not right.' : null);
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many tries from here. Wait a little.');
      } else if (err instanceof ApiError && err.status === 503) {
        setError('This server is full right now.');
      } else {
        setError('Could not reach the server.');
      }
    } finally {
      setIsEntering(false);
    }
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
    <div className="relative min-h-screen overflow-hidden bg-[#0c1a52]">
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

          {/* The gesture lives here and must not look like it does: no cursor
              change, no hover state, no title attribute, nothing in the DOM a
              guest could notice. Seven taps in rhythm, or nothing happens. */}
          <h1
            onClick={onLogoTap}
            className="title-sheen-host font-brand font-bold leading-[0.95] tracking-tight text-blue-950 select-none"
            style={{ fontSize: TITLE_SIZE }}
          >
            <span
              key={taps}
              className={`inline-flex items-center gap-[0.12em] ${taps > 0 ? 'title-tapped' : ''}`}
            >
              <BrandMark className="h-[0.62em] w-[0.62em] border-[0.055em] border-blue-950" />
              <span className="relative inline-block">
                <span className="title-sheen-text">
                  brainless<span className="text-orange-600">music</span>
                </span>
                {/* A second copy of the type, clipped to the same glyphs, for
                    the line that runs across on a tap. Separate element by
                    necessity: the resting sheen already drives
                    `background-position` on the text itself. */}
                {taps > 0 && (
                  <span aria-hidden className="title-tap-line">
                    brainlessmusic
                  </span>
                )}
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
                {needsCode && (
                  <>
                    <label className="mb-1 block text-sm text-blue-950/70" htmlFor="entry-code">
                      This server asks for a code
                    </label>
                    <input
                      id="entry-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoFocus
                      className="mb-3 w-full rounded-md border border-blue-950/30 bg-white px-3 py-3 text-base text-blue-950 outline-none transition-colors focus:border-orange-600"
                    />
                  </>
                )}

                {/* One instruction, the way the reference has one. Big enough
                    for a thumb (min-h-14), full width on a phone, and its
                    blink never reaches invisible — a control you cannot see is
                    a control you cannot press. */}
                <button
                  type="submit"
                  disabled={isEntering}
                  className="btn-primary btn-md enter-blink min-h-14 w-full text-base font-semibold uppercase tracking-[0.15em] sm:w-auto sm:px-10"
                >
                  {isEntering ? 'Entering…' : isReturning ? 'Click here to resume' : 'Click here to enter'}
                </button>
              </form>
            )}

            {error && (
              <p className="mt-3 rounded-md bg-red-700 px-3 py-2 text-sm text-white">{error}</p>
            )}

            {/* Exit keeps the token, so the returning line has to say so —
                otherwise the attract screen reads as a sign-out and the honest
                worry is "have I just lost my playlists?". */}
            <p className="mt-4 text-xs text-blue-950/45">
              {isReturning
                ? 'Still signed in on this device. Your library is where you left it.'
                : 'No account needed. This device gets its own listening history.'}
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

      {showNumpad && (
        <AdminNumpad
          onUnlocked={() => navigate('/login')}
          onDismiss={() => setShowNumpad(false)}
        />
      )}
    </div>
  );
}
