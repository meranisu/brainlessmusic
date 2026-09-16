import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ArcadeInterstitial, ArrivalVeil } from '../components/ArcadeInterstitial';
import { ShellBackdrop } from '../components/BackdropDepth';
import { BrandMark, Wordmark } from '../components/BrandLockup';
import { Numpad } from '../components/Numpad';
import { useThemeCycle } from '../hooks/useThemeCycle';
import { ApiError } from '../lib/apiClient';
import { clearAtTitle, markAtTitle, markJustEntered } from '../lib/boot';
import { arrivalDuration, interstitialDuration, prefersReducedMotion } from '../lib/interstitial';
import type { User } from '../types/api';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Nobody left this screen open on purpose for five minutes — an arcade
 * cabinet doesn't hold a player-select screen forever either, and a sign-in
 * form with a username sitting in it is exactly the kind of thing a shared
 * device shouldn't be left showing. Events reset it, not renders: a re-render
 * from, say, a failed login already followed real input, so tying the timer
 * to input events directly (rather than to component state) is what keeps a
 * slow typist from being timed out mid-word.
 */
const IDLE_MS = 5 * 60 * 1000;
const IDLE_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input'] as const;

/**
 * How long the winning card's zoom-and-fade runs before the welcome card
 * takes over. Must match `--commit` / `.profile-card-commit` in index.css —
 * the same JS/CSS split the title screen's `EXIT_MS`/`--exit` uses, for the
 * same reason: CSS drives the animation, JS decides when to move on, and the
 * two have to agree.
 */
const COMMIT_MS = 420;
function commitDuration(): number {
  return prefersReducedMotion() ? 0 : COMMIT_MS;
}

/** Which card, if either, is currently being committed to. */
type Committing = 'login' | 'guest' | null;

/**
 * Remembers, per account and per browser, that this person already said no
 * to setting a passcode — so the prompt asks once and then leaves it to
 * Options, rather than nagging on every future password login. `localStorage`
 * rather than the server: it's a UI courtesy, not a fact about the account,
 * and it costs nothing if it's ever lost.
 */
const PASSCODE_PROMPT_DISMISSED_PREFIX = 'brainlessmusic.passcodePromptDismissed.';

function passcodePromptDismissed(userId: number): boolean {
  try {
    return localStorage.getItem(`${PASSCODE_PROMPT_DISMISSED_PREFIX}${userId}`) !== null;
  } catch {
    return false;
  }
}

function dismissPasscodePrompt(userId: number): void {
  try {
    localStorage.setItem(`${PASSCODE_PROMPT_DISMISSED_PREFIX}${userId}`, '1');
  } catch {
    // Private mode or blocked site data. Worst case, asked again next time.
  }
}

/**
 * The "insert your card" screen: a save-file sign-in on the left, a guest
 * pass on the right. Reached only from the title screen's CRT exit, which is
 * why the arrival veil below plays unconditionally rather than being gated
 * the way `TitleScreenPage`'s is — there is no cold-load path that lands
 * here without one.
 *
 * Signing in has two shapes now: the traditional username and password, or a
 * username and a short bound passcode — the arcade-card-PIN idea, entered on
 * the same numeric keypad the old hidden admin numpad used to be. A fresh
 * account has no passcode until it makes one, from here on its first
 * password login or later from Options.
 */
export function AccountSelectPage() {
  const { user, login, loginWithPasscode, setPasscode, enterAsGuest } = useAuth();
  const navigate = useNavigate();
  useThemeCycle();

  const [authMode, setAuthMode] = useState<'password' | 'passcode'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPasscodeLogin, setShowPasscodeLogin] = useState(false);
  const passcodeLoginResult = useRef<User | null>(null);

  // Set once a password login succeeds against an account with no passcode
  // yet, and not already declined on this browser — the login card swaps its
  // form for the "want a passcode?" prompt instead of finishing entry.
  const [pendingPasscodeSetup, setPendingPasscodeSetup] = useState<User | null>(null);
  const [showCreatePasscode, setShowCreatePasscode] = useState(false);

  const [guestNeedsCode, setGuestNeedsCode] = useState(false);
  const [guestCode, setGuestCode] = useState('');
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isEnteringGuest, setIsEnteringGuest] = useState(false);

  /** Which card just succeeded, and is now zooming into black. */
  const [committing, setCommitting] = useState<Committing>(null);
  /** Set once the winning card's request resolves — swaps the whole page for the welcome card. */
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  /** Five minutes with nobody touching this screen. */
  const [idleTimedOut, setIdleTimedOut] = useState(false);

  const [arriving, setArriving] = useState(() => arrivalDuration() > 0);

  useEffect(() => {
    if (!arriving) return;
    const done = setTimeout(() => setArriving(false), arrivalDuration());
    return () => clearTimeout(done);
  }, [arriving]);

  // A choice already being committed to (or a passcode prompt being decided)
  // isn't idleness — there is a request in flight or a real decision pending,
  // not an abandoned form — so the timer doesn't even start during either.
  useEffect(() => {
    if (committing || welcomeName !== null || pendingPasscodeSetup) return;

    let timer = window.setTimeout(() => setIdleTimedOut(true), IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdleTimedOut(true), IDLE_MS);
    };

    for (const event of IDLE_EVENTS) window.addEventListener(event, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const event of IDLE_EVENTS) window.removeEventListener(event, reset);
    };
  }, [committing, welcomeName, pendingPasscodeSetup]);

  // Same shape as `finishEntry` below, but leaving empty-handed rather than
  // signed in: hold on the card, then go — `markAtTitle` so the title screen
  // plays its own arrival veil, the same as it does after a deliberate Exit.
  useEffect(() => {
    if (!idleTimedOut) return;
    const done = setTimeout(() => {
      markAtTitle();
      navigate('/enter', { replace: true });
    }, interstitialDuration());
    return () => clearTimeout(done);
  }, [idleTimedOut, navigate]);

  // Already signed in — reached directly, or a double-back after committing
  // already navigated away. Nothing left to choose. `pendingPasscodeSetup` is
  // the third exemption alongside `committing`: a password login sets `user`
  // the instant it resolves, before this page has decided whether to show
  // the "want a passcode?" prompt — without it, this redirect would fire on
  // that very first render and skip the prompt every time.
  if (user && !committing && !pendingPasscodeSetup) return <Navigate to="/" replace />;

  /** Shared tail for both cards: hold on the welcome text, then land in the app. */
  async function finishEntry(name: string) {
    setWelcomeName(name);
    const wait = interstitialDuration();
    if (wait > 0) await delay(wait);
    markJustEntered();
    clearAtTitle();
    navigate('/', { replace: true });
  }

  /**
   * Plays the winning card's zoom-and-fade, then hands off to `finishEntry`.
   * Used once the sign-in side already knows who it's signing in as — unlike
   * the guest card below, there is no request left to overlap the animation
   * with here, since the password/passcode/passcode-creation request has
   * already resolved by the time this is called.
   */
  async function commitAndFinish(which: Exclude<Committing, null>, name: string) {
    setCommitting(which);
    await delay(commitDuration());
    await finishEntry(name);
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (committing || pendingPasscodeSetup) return;
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const who = await login(username, password);
      if (!who.hasPasscode && !passcodePromptDismissed(who.id)) {
        setPendingPasscodeSetup(who);
        return;
      }
      await commitAndFinish('login', who.username);
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : 'Could not sign in — is the backend running?');
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handlePasscodeLoginSubmit(code: string) {
    passcodeLoginResult.current = await loginWithPasscode(username, code);
  }

  function handlePasscodeLoginSuccess() {
    setShowPasscodeLogin(false);
    const who = passcodeLoginResult.current;
    if (who) void commitAndFinish('login', who.username);
  }

  async function handleCreatePasscodeSubmit(code: string) {
    await setPasscode(code);
  }

  function handleCreatePasscodeSuccess() {
    setShowCreatePasscode(false);
    if (pendingPasscodeSetup) void commitAndFinish('login', pendingPasscodeSetup.username);
  }

  function skipPasscodeSetup() {
    if (!pendingPasscodeSetup) return;
    dismissPasscodePrompt(pendingPasscodeSetup.id);
    void commitAndFinish('login', pendingPasscodeSetup.username);
  }

  async function handleGuest(event: FormEvent) {
    event.preventDefault();
    if (committing) return;
    setGuestError(null);
    setIsEnteringGuest(true);
    setCommitting('guest');

    try {
      const [who] = await Promise.all([
        enterAsGuest(guestNeedsCode ? guestCode : undefined),
        delay(commitDuration()),
      ]);
      await finishEntry(who.username);
    } catch (err) {
      setCommitting(null);
      // A 401 on the first press is how the client learns this server wants
      // a code — the server does not advertise it, and does not need to.
      if (err instanceof ApiError && err.status === 401) {
        setGuestNeedsCode(true);
        setGuestError(guestNeedsCode ? 'That code is not right.' : null);
      } else if (err instanceof ApiError && err.status === 429) {
        setGuestError('Too many tries from here. Wait a little.');
      } else if (err instanceof ApiError && err.status === 503) {
        setGuestError('This server is full right now.');
      } else {
        setGuestError('Could not reach the server.');
      }
    } finally {
      setIsEnteringGuest(false);
    }
  }

  if (welcomeName !== null) {
    return <ArcadeInterstitial text={`Welcome to the system, ${welcomeName}`} />;
  }

  if (idleTimedOut) {
    return <ArcadeInterstitial text="Returning to title screen" detail="No activity" />;
  }

  const disabled = Boolean(committing) || pendingPasscodeSetup !== null;
  // Which card, in spirit, currently has the floor — mid-commit, or mid a
  // passcode-setup decision that hasn't started its own commit yet.
  const active: Committing = committing ?? (pendingPasscodeSetup ? 'login' : null);
  const recede = (mine: Committing) => (active && active !== mine ? 'profile-card-recede' : '');

  return (
    <div className="app-ground relative min-h-screen overflow-hidden text-white">
      <ShellBackdrop vivid />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6">
        <div className={`profile-stage-1 mb-10 flex flex-col items-center gap-4 text-center ${recede(null)}`}>
          <span className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 border-2 border-blue-300 sm:h-12 sm:w-12" />
            <Wordmark className="text-2xl text-white sm:text-3xl" />
          </span>
          <h1 className="font-display text-2xl font-semibold uppercase tracking-[0.1em] text-white sm:text-3xl">
            Select your profile type
          </h1>
        </div>

        <div className="grid w-full max-w-3xl gap-5 md:grid-cols-2">
          {/* ── Sign in: a returning player with a save file ─────────────── */}
          <div
            className={`profile-stage-2 profile-card-glow card p-6 sm:p-7 ${
              committing === 'login' ? 'profile-card-commit' : recede('login')
            }`}
          >
            {pendingPasscodeSetup ? (
              <>
                <h2 className="text-lg font-semibold text-white">Want a faster way back in?</h2>
                <p className="mt-1 text-sm text-blue-300">
                  Set a short passcode for{' '}
                  <span className="font-medium text-white">{pendingPasscodeSetup.username}</span> —
                  next time, sign in with that instead of typing a password. You can add or change
                  this later from Options.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setShowCreatePasscode(true)}
                    className="btn-primary btn-md flex-1"
                  >
                    Create a passcode
                  </button>
                  <button onClick={skipPasscodeSetup} className="btn-secondary btn-md">
                    Skip
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Sign in</h2>
                    <p className="mt-1 text-sm text-blue-300">Returning, with an account on this server.</p>
                  </div>
                  <div className="flex shrink-0 rounded-md border border-blue-700 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setAuthMode('password')}
                      disabled={disabled}
                      className={`rounded px-2.5 py-1 font-medium transition-colors ${
                        authMode === 'password' ? 'bg-blue-700 text-white' : 'text-blue-300 hover:text-white'
                      }`}
                    >
                      Password
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('passcode')}
                      disabled={disabled}
                      className={`rounded px-2.5 py-1 font-medium transition-colors ${
                        authMode === 'passcode' ? 'bg-blue-700 text-white' : 'text-blue-300 hover:text-white'
                      }`}
                    >
                      Passcode
                    </button>
                  </div>
                </div>

                {authMode === 'password' ? (
                  <form onSubmit={handleLogin} className="mt-5">
                    <label className="mb-1 block text-sm text-blue-200" htmlFor="username">
                      Username
                    </label>
                    <input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                      disabled={disabled}
                      className="input mb-4"
                    />

                    <label className="mb-1 block text-sm text-blue-200" htmlFor="password">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      disabled={disabled}
                      className="input mb-4"
                    />

                    {loginError && (
                      <p className="mb-4 rounded-md border border-red-700 bg-red-700 px-3 py-2 text-sm text-white">
                        {loginError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={isLoggingIn || disabled}
                      className="btn-primary btn-md w-full"
                    >
                      {isLoggingIn ? 'Signing in…' : 'Sign in'}
                    </button>
                  </form>
                ) : (
                  <div className="mt-5">
                    <label className="mb-1 block text-sm text-blue-200" htmlFor="passcode-username">
                      Username
                    </label>
                    <input
                      id="passcode-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      required
                      disabled={disabled}
                      className="input mb-4"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPasscodeLogin(true)}
                      disabled={disabled || username.length === 0}
                      className="btn-primary btn-md w-full"
                    >
                      Enter passcode
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Guest: a new player trying the system out ─────────────────── */}
          <div
            className={`profile-stage-3 profile-card-glow card p-6 sm:p-7 ${
              committing === 'guest' ? 'profile-card-commit' : recede('guest')
            }`}
          >
            <h2 className="text-lg font-semibold text-white">Continue as guest</h2>
            <p className="mt-1 text-sm text-blue-300">
              No account needed. This device gets its own listening history.
            </p>

            <form onSubmit={handleGuest} className="mt-5">
              {guestNeedsCode && (
                <>
                  <label className="mb-1 block text-sm text-blue-200" htmlFor="entry-code">
                    This server asks for a code
                  </label>
                  <input
                    id="entry-code"
                    value={guestCode}
                    onChange={(e) => setGuestCode(e.target.value)}
                    autoFocus
                    disabled={disabled}
                    className="input mb-4"
                  />
                </>
              )}

              {guestError && (
                <p className="mb-4 rounded-md border border-red-700 bg-red-700 px-3 py-2 text-sm text-white">
                  {guestError}
                </p>
              )}

              <button
                type="submit"
                disabled={isEnteringGuest || disabled}
                className="btn-primary btn-md w-full"
              >
                {isEnteringGuest ? 'Entering…' : 'Enter as guest'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {showPasscodeLogin && (
        <Numpad
          title={`Passcode for ${username}`}
          minLength={4}
          maxLength={8}
          submitLabel="Sign in"
          onSubmit={handlePasscodeLoginSubmit}
          onSuccess={handlePasscodeLoginSuccess}
          onDismiss={() => setShowPasscodeLogin(false)}
        />
      )}

      {showCreatePasscode && (
        <Numpad
          title="Choose a passcode"
          minLength={4}
          maxLength={8}
          submitLabel="Save"
          submittingLabel="Saving…"
          onSubmit={handleCreatePasscodeSubmit}
          onSuccess={handleCreatePasscodeSuccess}
          onDismiss={() => setShowCreatePasscode(false)}
        />
      )}

      {arriving && <ArrivalVeil />}
    </div>
  );
}
