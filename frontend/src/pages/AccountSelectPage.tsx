import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ArcadeInterstitial, ArrivalVeil } from '../components/ArcadeInterstitial';
import { ShellBackdrop } from '../components/BackdropDepth';
import { BrandMark, Wordmark } from '../components/BrandLockup';
import { Numpad } from '../components/Numpad';
import { PasscodePad } from '../components/PasscodePad';
import { PasswordInput } from '../components/PasswordInput';
import { RegisterForm } from '../components/RegisterForm';
import { useThemeCycle } from '../hooks/useThemeCycle';
import { apiClient, ApiError } from '../lib/apiClient';
import { clearAtTitle, markAtTitle, markJustEntered } from '../lib/boot';
import { copyText } from '../lib/copyText';
import { prettyGuestCode } from '../lib/guestCodeCard';
import { arrivalDuration, interstitialDuration, prefersReducedMotion } from '../lib/interstitial';
import { getItem, getJSON, removeItem, setItem, setJSON } from '../lib/safeStorage';
import type { User } from '../types/api';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resets the screen after two idle minutes, so a shared device isn't left showing a username. Input events reset it. */
const IDLE_MS = 2 * 60 * 1000;
const IDLE_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'input'] as const;

/** The winning card's zoom-and-fade. Must match `--commit` in index.css. */
const COMMIT_MS = 420;
function commitDuration(): number {
  return prefersReducedMotion() ? 0 : COMMIT_MS;
}

/** The grid's fade before the register form grows in. Must match `.profile-card-recede`. */
const RECEDE_MS = 240;
function recedeDuration(): number {
  return prefersReducedMotion() ? 0 : RECEDE_MS;
}

/** Which card, if either, is currently being committed to. */
type Committing = 'login' | 'guest' | null;

/** A "Request a code" waiting for the admin (A67), kept so a reload keeps waiting instead of asking again. */
interface PendingRequest {
  id: number;
  secret: string;
}

const GUEST_REQUEST_KEY = 'brainlessmusic.guestRequest';
const REQUEST_POLL_MS = 3000;

function loadPendingRequest(): PendingRequest | null {
  const parsed = getJSON(GUEST_REQUEST_KEY) as Partial<PendingRequest> | null;
  return parsed && typeof parsed.id === 'number' && typeof parsed.secret === 'string'
    ? { id: parsed.id, secret: parsed.secret }
    : null;
}

function savePendingRequest(request: PendingRequest | null): void {
  // Private mode or blocked site data: a reload forgets the request, and the guest asks again.
  if (request) setJSON(GUEST_REQUEST_KEY, request);
  else removeItem(GUEST_REQUEST_KEY);
}

/** Where a request stands, as the guest card shows it. `gone`: unknown, already collected, or the server lost it. */
type RequestState = 'waiting' | 'denied' | 'expired' | 'gone';

/** Remembers per account, per browser, that the passcode prompt was declined, so it asks once. */
const PASSCODE_PROMPT_DISMISSED_PREFIX = 'brainlessmusic.passcodePromptDismissed.';

function passcodePromptDismissed(userId: number): boolean {
  return getItem(`${PASSCODE_PROMPT_DISMISSED_PREFIX}${userId}`) !== null;
}

function dismissPasscodePrompt(userId: number): void {
  // Private mode or blocked site data. Worst case, asked again next time.
  setItem(`${PASSCODE_PROMPT_DISMISSED_PREFIX}${userId}`, '1');
}

/**
 * Account select: sign in on the left (password or passcode), guest on the right. Reached only via the title screen's
 * exit, so its arrival veil always plays.
 */
export function AccountSelectPage() {
  const { user, login, loginWithPasscode, register, setPasscode, enterAsGuest, adoptToken } = useAuth();
  const navigate = useNavigate();
  useThemeCycle();

  // Hidden until the check resolves, so the button never flashes on a closed server.
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  /** True for the brief window where the grid is fading out on its way to `showRegister`. */
  const [startingRegister, setStartingRegister] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ open: boolean }>('/auth/registration-status')
      .then((res) => setRegistrationOpen(res.open))
      .catch(() => setRegistrationOpen(false));
  }, []);

  const [authMode, setAuthMode] = useState<'password' | 'passcode'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [passcode, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isPasscodeLoggingIn, setIsPasscodeLoggingIn] = useState(false);
  // Passcode mode starts as a button, so the keypad doesn't push the card past the fold until asked for.
  const [passcodeKeypadOpen, setPasscodeKeypadOpen] = useState(false);

  // Set after a password login to an account with no passcode (not declined here); the card shows the prompt instead.
  const [pendingPasscodeSetup, setPendingPasscodeSetup] = useState<User | null>(null);
  const [showCreatePasscode, setShowCreatePasscode] = useState(false);

  // `?code=` from a shared guest link: prefilled, then removed from the address bar so a spent code isn't carried around.
  const [linkedGuestCode] = useState(() => new URLSearchParams(window.location.search).get('code') ?? '');
  const [guestNeedsCode, setGuestNeedsCode] = useState(linkedGuestCode !== '');
  const [guestCode, setGuestCode] = useState(linkedGuestCode);

  useEffect(() => {
    if (linkedGuestCode) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [linkedGuestCode]);
  const [guestError, setGuestError] = useState<string | null>(null);
  const [isEnteringGuest, setIsEnteringGuest] = useState(false);
  const [guestName, setGuestName] = useState('');

  // "Request a code" (A67): the device waits here and is signed in when the admin approves.
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(loadPendingRequest);
  const [requestState, setRequestState] = useState<RequestState | null>(() =>
    loadPendingRequest() ? 'waiting' : null,
  );
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestUnreachable, setRequestUnreachable] = useState(false);
  /** Shown once after approval: the code for this guest's other devices. */
  const [handedCode, setHandedCode] = useState<{ code: string; name: string } | null>(null);

  /** Which card just succeeded, and is now zooming into black. */
  const [committing, setCommitting] = useState<Committing>(null);
  /** Set when the winning request resolves; swaps the page for the welcome card. */
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  /** Five minutes with nobody touching this screen. */
  const [idleTimedOut, setIdleTimedOut] = useState(false);

  const [arriving, setArriving] = useState(() => arrivalDuration() > 0);

  useEffect(() => {
    if (!arriving) return;
    const done = setTimeout(() => setArriving(false), arrivalDuration());
    return () => clearTimeout(done);
  }, [arriving]);

  // No idle timer while committing or deciding the passcode prompt.
  useEffect(() => {
    if (
      committing ||
      welcomeName !== null ||
      pendingPasscodeSetup ||
      showRegister ||
      startingRegister ||
      requestState === 'waiting' ||
      handedCode
    ) {
      return;
    }

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
  }, [committing, welcomeName, pendingPasscodeSetup, showRegister, startingRegister, requestState, handedCode]);

  // Polls the waiting request. On approval, signs in and holds on the code card until the guest continues.
  useEffect(() => {
    if (!pendingRequest || requestState !== 'waiting') return;

    let stopped = false;
    async function poll() {
      try {
        const result = await apiClient.post<
          { status: 'pending' | 'denied' | 'expired' } | { status: 'approved'; token: string; code: string }
        >(`/auth/guest/requests/${pendingRequest!.id}/collect`, { secret: pendingRequest!.secret });
        if (stopped) return;
        setRequestUnreachable(false);
        if (result.status === 'pending') return;

        savePendingRequest(null);
        setPendingRequest(null);
        if (result.status === 'approved') {
          // Code card first: signing in sets `user`, and without it this page would redirect before showing the code.
          setHandedCode({ code: result.code, name: '' });
          setRequestState(null);
          try {
            const who = await adoptToken(result.token);
            setHandedCode({ code: result.code, name: who.displayName });
          } catch {
            // The token is spent, but the code still works: put it in the form.
            setHandedCode(null);
            setGuestCode(prettyGuestCode(result.code));
            setGuestNeedsCode(true);
            setGuestError('Approved, but signing in failed. Press Enter as guest to use your new code.');
          }
        } else {
          setRequestState(result.status);
        }
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && err.status === 404) {
          savePendingRequest(null);
          setPendingRequest(null);
          setRequestState('gone');
        } else {
          setRequestUnreachable(true);
        }
      }
    }

    // Each poll waits for the last one. With overlapping polls, a later poll's 404 (already collected) could arrive
    // before the approval it followed (G1).
    let timer: number | undefined;
    async function loop() {
      await poll();
      if (!stopped) timer = window.setTimeout(() => void loop(), REQUEST_POLL_MS);
    }
    void loop();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    // `adoptToken` is a new function on every provider render; restarting the poll for that would reset its timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRequest, requestState]);

  // Idle timeout: hold on the card, then return to the title screen (`markAtTitle`, so it plays its veil).
  useEffect(() => {
    if (!idleTimedOut) return;
    const done = setTimeout(() => {
      markAtTitle();
      navigate('/', { replace: true });
    }, interstitialDuration());
    return () => clearTimeout(done);
  }, [idleTimedOut, navigate]);

  // Signed in already. Exempt while committing, prompting for a passcode or registering: `user` is set the moment
  // those requests resolve, before this page decides its next step.
  if (user && !committing && !pendingPasscodeSetup && !showRegister && !handedCode) return <Navigate to="/" replace />;

  /** Shared tail for both cards: hold on the welcome text, then land in the app. */
  async function finishEntry(name: string) {
    setWelcomeName(name);
    const wait = interstitialDuration();
    if (wait > 0) await delay(wait);
    markJustEntered();
    clearAtTitle();
    navigate('/', { replace: true });
  }

  /** Plays the winning card's zoom, then `finishEntry`. The sign-in request has already resolved. */
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
      await commitAndFinish('login', who.displayName);
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : 'Could not sign in. Is the backend running?');
    } finally {
      setIsLoggingIn(false);
    }
  }

  function openPasscodeKeypad() {
    if (disabled || username.length === 0) return;
    setPasscodeError(null);
    setPasscodeKeypadOpen(true);
  }

  function closePasscodeKeypad() {
    setPasscodeKeypadOpen(false);
    setPasscodeInput('');
    setPasscodeError(null);
  }

  function pressPasscodeDigit(digit: string) {
    setPasscodeError(null);
    setPasscodeInput((current) => (current.length >= 8 ? current : current + digit));
  }

  function backspacePasscodeDigit() {
    setPasscodeInput((current) => current.slice(0, -1));
  }

  async function submitPasscodeLogin(event: FormEvent) {
    event.preventDefault();
    if (committing || pendingPasscodeSetup || isPasscodeLoggingIn || passcode.length < 4) return;
    setPasscodeError(null);
    setIsPasscodeLoggingIn(true);

    try {
      const who = await loginWithPasscode(username, passcode);
      await commitAndFinish('login', who.displayName);
    } catch (err) {
      setPasscodeError(err instanceof ApiError ? err.message : 'Could not sign in. Is the backend running?');
      setPasscodeInput('');
    } finally {
      setIsPasscodeLoggingIn(false);
    }
  }

  async function handleCreatePasscodeSubmit(code: string) {
    await setPasscode(code);
  }

  function handleCreatePasscodeSuccess() {
    setShowCreatePasscode(false);
    if (pendingPasscodeSetup) void commitAndFinish('login', pendingPasscodeSetup.displayName);
  }

  function skipPasscodeSetup() {
    if (!pendingPasscodeSetup) return;
    dismissPasscodePrompt(pendingPasscodeSetup.id);
    void commitAndFinish('login', pendingPasscodeSetup.displayName);
  }

  /** Fades the grid out, then swaps to the register form once it's clear. */
  async function beginRegister() {
    if (disabled) return;
    setStartingRegister(true);
    await delay(recedeDuration());
    setStartingRegister(false);
    setShowRegister(true);
  }

  async function handleRegisterSubmit({ username: newUsername, password: newPassword }: { username: string; password: string }) {
    return register(newUsername, newPassword);
  }

  // `showRegister` stays set: the card starts its own commit. New accounts go through the same passcode prompt as logins.
  function handleRegisterSuccess(who: User) {
    if (!who.hasPasscode && !passcodePromptDismissed(who.id)) {
      setPendingPasscodeSetup(who);
      return;
    }
    void commitAndFinish('login', who.displayName);
  }

  function cancelRegister() {
    setShowRegister(false);
  }

  async function handleGuest(event: FormEvent) {
    event.preventDefault();
    if (committing) return;
    setGuestError(null);
    setIsEnteringGuest(true);
    setCommitting('guest');

    try {
      const [who] = await Promise.all([
        enterAsGuest({ code: guestNeedsCode ? guestCode : undefined, name: guestName }),
        delay(commitDuration()),
      ]);
      await finishEntry(who.displayName);
    } catch (err) {
      setCommitting(null);
      // A 401 on the first press is how the client learns the server wants a code.
      if (err instanceof ApiError && err.status === 401) {
        setGuestNeedsCode(true);
        setGuestError(
          guestNeedsCode ? 'That code is not right.' : 'This server asks for a code. Type yours, or request one.',
        );
      } else if (err instanceof ApiError && err.status === 400) {
        setGuestError('Names can be up to 32 characters.');
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

  async function requestCode() {
    if (committing || isRequesting) return;
    setGuestError(null);
    setIsRequesting(true);

    try {
      const created = await apiClient.post<PendingRequest>('/auth/guest/requests', {
        name: guestName,
        platform: 'web',
      });
      savePendingRequest(created);
      setRequestUnreachable(false);
      setPendingRequest(created);
      setRequestState('waiting');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setGuestError('You have asked a few times already. Try again in an hour.');
      } else if (err instanceof ApiError && err.status === 503) {
        setGuestError('Too many requests are waiting for the admin. Try again later.');
      } else if (err instanceof ApiError && err.status === 400) {
        setGuestError('Names can be up to 32 characters.');
      } else {
        setGuestError('Could not reach the server.');
      }
    } finally {
      setIsRequesting(false);
    }
  }

  /** Stops waiting and withdraws the request, so the admin isn't asked about it. Not awaited: it expires anyway. */
  function stopWaiting() {
    if (pendingRequest) {
      void apiClient
        .post(`/auth/guest/requests/${pendingRequest.id}/cancel`, { secret: pendingRequest.secret })
        .catch(() => {});
    }
    savePendingRequest(null);
    setPendingRequest(null);
    setRequestState(null);
    setRequestUnreachable(false);
  }

  async function copyHandedCode() {
    if (!handedCode) return;
    if (await copyText(prettyGuestCode(handedCode.code))) {
      setGuestError('Copied.');
    } else {
      setGuestError('Copying is blocked here. Select the code and copy it by hand.');
    }
  }

  function continueWithHandedCode() {
    if (!handedCode) return;
    setGuestError(null);
    void commitAndFinish('guest', handedCode.name);
  }

  if (welcomeName !== null) {
    return <ArcadeInterstitial text={`Welcome to the system, ${welcomeName}`} />;
  }

  if (idleTimedOut) {
    return <ArcadeInterstitial text="Returning to title screen" detail="No activity" />;
  }

  const disabled = Boolean(committing) || pendingPasscodeSetup !== null || startingRegister;
  // Only a real commit clears the rest of the screen; the passcode prompt is still a question.
  const recede = (mine: Committing) => (committing && committing !== mine ? 'profile-card-recede' : '');
  // Cards fade for `startingRegister` while the header stays, so this is separate from `recede`.
  const gridFade = (mine: Committing) => (startingRegister ? 'profile-card-recede' : recede(mine));

  return (
    <div className="app-ground relative min-h-screen overflow-hidden text-white">
      <ShellBackdrop vivid />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:px-6">
        <div className={`profile-stage-1 mb-4 flex flex-col items-center gap-4 text-center ${recede(null)}`}>
          <span className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 border-2 border-blue-300 sm:h-12 sm:w-12" />
            <Wordmark className="text-2xl text-white sm:text-3xl" />
          </span>
          <h1 className="font-display text-2xl font-semibold uppercase tracking-[0.1em] text-white sm:text-3xl">
            {pendingPasscodeSetup
              ? 'Creating a passcode'
              : showRegister || startingRegister
                ? 'Creating a new profile'
                : 'Select your profile type'}
          </h1>
        </div>

        {pendingPasscodeSetup ? (
          /* ── Passcode prompt: its own centered card, not a slot in the grid ── */
          <div
            className={`profile-stage-2 profile-card-glow card w-full max-w-md p-6 sm:p-7 ${
              committing === 'login' ? 'profile-card-commit' : ''
            }`}
          >
            <h2 className="text-lg font-semibold text-white">Want a faster way back in?</h2>
            <p className="mt-1 text-sm text-blue-300">
              Set a short passcode for{' '}
              <span className="font-medium text-white">{pendingPasscodeSetup.username}</span>.
              Next time, sign in with that instead of typing a password. You can add or change
              this later from Options.
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowCreatePasscode(true)} className="btn-primary btn-md flex-1">
                Create a passcode
              </button>
              <button onClick={skipPasscodeSetup} className="btn-secondary btn-md">
                Skip
              </button>
            </div>
          </div>
        ) : showRegister ? (
          /* Register: the whole card is the form. */
          <RegisterForm
            onSubmit={handleRegisterSubmit}
            onSuccess={handleRegisterSuccess}
            onCancel={cancelRegister}
            disabled={disabled}
            className={`profile-card-glow card w-full max-w-md p-6 sm:p-7 ${
              committing === 'login' ? 'profile-card-commit' : 'profile-card-grow-in'
            }`}
          />
        ) : (
          <div className="grid w-full max-w-3xl gap-5 md:grid-cols-2">
            {/* Sign in: a returning player. */}
            <div
              className={`profile-stage-2 profile-card-glow card p-6 sm:p-7 ${
                committing === 'login' ? 'profile-card-commit' : gridFade('login')
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Sign in</h2>
                  <p className="mt-1 text-sm text-blue-300">Returning, with an account on this server.</p>
                </div>
                <div className="flex shrink-0 rounded-md border border-blue-700 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('password');
                      setPasscodeInput('');
                      setPasscodeError(null);
                      setPasscodeKeypadOpen(false);
                    }}
                    disabled={disabled}
                    className={`rounded px-2.5 py-1 font-medium transition-colors ${
                      authMode === 'password' ? 'bg-blue-700 text-white' : 'text-blue-300 hover:text-white'
                    }`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('passcode');
                      setLoginError(null);
                      setPasscodeKeypadOpen(false);
                    }}
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
                    Username or email
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
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                    required
                    disabled={disabled}
                    className="mb-4"
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
                <form onSubmit={submitPasscodeLogin} className="mt-5">
                  <label className="mb-1 block text-sm text-blue-200" htmlFor="passcode-username">
                    Username or email
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

                  {passcodeKeypadOpen ? (
                    <>
                      <label className="mb-1 block text-sm text-blue-200">Passcode</label>
                      <PasscodePad
                        code={passcode}
                        maxLength={8}
                        disabled={disabled || isPasscodeLoggingIn}
                        onPress={pressPasscodeDigit}
                        onBackspace={backspacePasscodeDigit}
                      />

                      {passcodeError && (
                        <p className="mt-3 rounded-md border border-red-700 bg-red-700 px-3 py-2 text-sm text-white">
                          {passcodeError}
                        </p>
                      )}

                      <div className="mt-2 flex gap-2">
                        <button
                          type="submit"
                          disabled={isPasscodeLoggingIn || disabled || passcode.length < 4}
                          className="btn-primary btn-md flex-1"
                        >
                          {isPasscodeLoggingIn ? 'Signing in…' : 'Sign in'}
                        </button>
                        <button
                          type="button"
                          onClick={closePasscodeKeypad}
                          disabled={isPasscodeLoggingIn}
                          className="btn-secondary btn-md"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={openPasscodeKeypad}
                      disabled={disabled || username.length === 0}
                      className="btn-primary btn-md w-full"
                    >
                      Enter passcode
                    </button>
                  )}
                </form>
              )}
            </div>

            {/* Guest, and below it register. One grid item, so the sign-in card still sets the row height. */}
            <div className="flex flex-col gap-5">
              <div
                className={`profile-stage-3 profile-card-glow card p-6 sm:p-7 ${
                  committing === 'guest' ? 'profile-card-commit' : gridFade('guest')
                }`}
              >
                {handedCode ? (
                  <>
                    <h2 className="text-lg font-semibold text-white">
                      {handedCode.name ? `You're in, ${handedCode.name}` : "You're in"}
                    </h2>
                    <p className="mt-1 text-sm text-blue-300">
                      This is your guest code. Type it on your phone or another browser to listen as the same
                      guest there. The admin can look it up if you lose it.
                    </p>
                    <p className="mt-4 font-mono text-2xl font-semibold tracking-wider text-white select-all">
                      {prettyGuestCode(handedCode.code)}
                    </p>
                    {guestError && (
                      <p className="mt-2 text-sm text-blue-200" role="status">
                        {guestError}
                      </p>
                    )}
                    <div className="mt-5 flex gap-2">
                      <button type="button" onClick={continueWithHandedCode} disabled={disabled} className="btn-primary btn-md flex-1">
                        Start listening
                      </button>
                      <button type="button" onClick={copyHandedCode} disabled={disabled} className="btn-secondary btn-md">
                        Copy code
                      </button>
                    </div>
                  </>
                ) : requestState ? (
                  <>
                    <h2 className="text-lg font-semibold text-white">
                      {requestState === 'waiting' ? 'Waiting for the admin' : 'Request closed'}
                    </h2>
                    <p className="mt-1 text-sm text-blue-300" role="status" aria-live="polite">
                      {requestState === 'waiting'
                        ? requestUnreachable
                          ? 'Lost touch with the server. Still trying.'
                          : 'Your request is in. Keep this page open and you go straight in once the admin approves it.'
                        : requestState === 'denied'
                          ? 'The admin turned this request down.'
                          : requestState === 'expired'
                            ? 'Nobody answered this request within a day.'
                            : 'This request is no longer open. If the admin already approved it, ask them for your code.'}
                    </p>
                    <button
                      type="button"
                      onClick={stopWaiting}
                      className={`${requestState === 'waiting' ? 'btn-secondary' : 'btn-primary'} btn-md mt-5 w-full`}
                    >
                      {requestState === 'waiting' ? 'Stop waiting' : 'Back'}
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold text-white">Continue as guest</h2>
                    <p className="mt-1 text-sm text-blue-300">
                      No account needed. A guest code lets you back in as the same guest on any device.
                    </p>

                    <form onSubmit={handleGuest} className="mt-5">
                      <label className="mb-1 block text-sm text-blue-200" htmlFor="guest-name">
                        Name <span className="text-blue-300">(optional)</span>
                      </label>
                      <input
                        id="guest-name"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        maxLength={32}
                        autoComplete="nickname"
                        aria-describedby="guest-name-hint"
                        disabled={disabled}
                        className="input"
                      />
                      <p id="guest-name-hint" className="mt-1 mb-4 text-xs text-blue-300">
                        Leave it blank and you're Guest plus a number.
                      </p>

                      {guestNeedsCode && (
                        <>
                          <label className="mb-1 block text-sm text-blue-200" htmlFor="entry-code">
                            Guest code
                          </label>
                          <input
                            id="entry-code"
                            value={guestCode}
                            onChange={(e) => setGuestCode(e.target.value)}
                            autoComplete="off"
                            autoCapitalize="characters"
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

                      <div className="mt-2 flex gap-2">
                        {!guestNeedsCode && (
                          <button
                            type="button"
                            onClick={() => {
                              setGuestError(null);
                              setGuestNeedsCode(true);
                            }}
                            disabled={disabled}
                            className="btn-ghost btn-md flex-1"
                          >
                            I have a code
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={requestCode}
                          disabled={disabled || isRequesting}
                          className="btn-ghost btn-md flex-1"
                        >
                          {isRequesting ? 'Asking…' : 'Request a code'}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>

              {/* The way in for someone holding an invite code (A191), whether or not open sign-ups are on: an upgrade
                  invite only works here. Hidden until the status check answers, like Register. */}
              {registrationOpen !== null && (
                <div className={`profile-stage-3b profile-card-glow card p-6 sm:p-7 ${gridFade('guest')}`}>
                  <h2 className="text-lg font-semibold text-white">Got an invite?</h2>
                  <p className="mt-1 text-sm text-blue-300">Make your account with the code you were sent.</p>
                  <Link to="/signup" className="btn-secondary btn-md mt-5 w-full text-center">
                    Sign up
                  </Link>
                </div>
              )}

              {registrationOpen && (
                <div
                  className={`profile-stage-3b profile-card-glow card p-6 sm:p-7 ${gridFade('guest')}`}
                >
                  <h2 className="text-lg font-semibold text-white">New here?</h2>
                  <p className="mt-1 text-sm text-blue-300">
                    Register your own account on this server.
                  </p>
                  <button
                    type="button"
                    onClick={beginRegister}
                    disabled={disabled}
                    className="btn-primary btn-md mt-5 w-full"
                  >
                    Create a new profile
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
