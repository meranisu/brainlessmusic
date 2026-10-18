import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ShellBackdrop } from '../components/BackdropDepth';
import { BrandMark, Wordmark } from '../components/BrandLockup';
import { PasswordInput } from '../components/PasswordInput';
import { MIN_PASSWORD_LENGTH, PASSCODE_PATTERN, sentence } from '../lib/accountRules';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatDate } from '../lib/format';

interface InvitePeek {
  status: 'open' | 'used' | 'expired' | 'revoked';
  expiresAt: string;
  forGuest: string | null;
}

/**
 * Sign-up, reachable signed out (A107-A112, A189-A192). From an invite link (`/invite/:token`) the code is already
 * known; from `/signup` the friend types the 8-character code first. Then a name, email, password and an optional
 * passcode, and they're signed in. An upgrade invite turns the guest it was made for into that account.
 */
export function InvitePage() {
  const { token: linkToken } = useParams();
  const [typedCode, setTypedCode] = useState<string | null>(null);
  const code = linkToken ?? typedCode;

  return (
    <div className="app-ground relative min-h-screen overflow-hidden text-white">
      <ShellBackdrop vivid />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:px-6">
        <span className="mb-6 flex items-center gap-3">
          <BrandMark className="h-10 w-10 border-2 border-blue-300 sm:h-12 sm:w-12" />
          <Wordmark className="text-2xl text-white sm:text-3xl" />
        </span>
        <div className="card w-full max-w-md p-6 sm:p-7">
          {code ? (
            <SignUpStep code={code} onBadCode={linkToken ? undefined : () => setTypedCode(null)} />
          ) : (
            <CodeStep onCode={setTypedCode} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Asks for the code. The check happens on the next step, which shows the same "doesn't work" message a link would. */
function CodeStep({ onCode }: { onCode: (code: string) => void }) {
  const [value, setValue] = useState('');
  const cleaned = value.replace(/[\s-]/g, '').toUpperCase();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (cleaned.length === 8) onCode(cleaned);
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="text-lg font-semibold text-white">Sign up</h2>
      <p className="mt-1 text-sm text-blue-300">
        Accounts here are by invite. Enter the 8-character code you were sent.
      </p>

      <label htmlFor="invite-code" className="mt-5 mb-1 block text-sm text-blue-200">
        Invite code
      </label>
      <input
        id="invite-code"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={12}
        placeholder="ABCD2345"
        required
        className="input mb-5 w-full font-mono tracking-widest uppercase"
      />

      <button type="submit" disabled={cleaned.length !== 8} className="btn-primary btn-md w-full">
        Continue
      </button>
      <Link to="/login" className="btn-ghost btn-md mt-2 w-full text-center">
        Back to sign in
      </Link>
    </form>
  );
}

function SignUpStep({ code, onBadCode }: { code: string; onBadCode?: () => void }) {
  const { adoptToken } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const { data, isLoading, isError, error: peekError } = useQuery({
    queryKey: ['invite', code],
    queryFn: () => apiClient.get<InvitePeek>(`/invites/${encodeURIComponent(code)}`),
    retry: false,
    // Checks are rate limited per address (30 an hour), and a refetch that failed would swap a half-filled form for
    // an error. Once is enough; after sign-up it would only answer "used".
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: done === null,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (passcode !== '' && !PASSCODE_PATTERN.test(passcode)) {
      setError('A passcode is 6 to 8 digits. Leave it empty to skip it.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiClient.post<{ token: string; username: string }>(
        `/invites/${encodeURIComponent(code)}/accept`,
        { username: username.trim(), email: email.trim(), password, passcode: passcode || undefined },
      );
      // Done first: signing in clears every cached query, and the account exists whether or not that part works.
      setDone(result.username);
      await adoptToken(result.token).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? sentence(err.message) : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <>
        <h2 className="text-lg font-semibold text-white">You're in, {done}</h2>
        <p className="mt-2 text-sm text-blue-300">
          On the Android app, choose Log in and use your name or email with the same password.
        </p>
        <button onClick={() => navigate('/', { replace: true })} className="btn-primary btn-md mt-5 w-full">
          Start listening
        </button>
      </>
    );
  }

  if (isLoading) return <p className="text-sm text-blue-300">Checking your code…</p>;

  if (isError || !data || data.status !== 'open') {
    const tooMany = peekError instanceof ApiError && peekError.status === 429;
    const what = onBadCode ? 'code' : 'link';
    return (
      <>
        <h2 className="text-lg font-semibold text-white">
          {tooMany ? 'Too many tries' : `This ${what} doesn't work`}
        </h2>
        <p className="mt-2 text-sm text-blue-300">
          {tooMany
            ? 'Wait a little, then try again.'
            : data?.status === 'used'
              ? 'It has already been used. If that was you, sign in with your name or email.'
              : data
                ? 'It has expired or was cancelled. Ask for a new one.'
                : 'Check it against the one you were sent, or ask for a new one.'}
        </p>
        {onBadCode && (
          <button onClick={onBadCode} className="btn-primary btn-md mt-5 w-full">
            Try another code
          </button>
        )}
        <Link to="/login" className={`${onBadCode ? 'btn-ghost mt-2' : 'btn-secondary mt-5'} btn-md w-full text-center`}>
          Go to sign in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <h2 className="text-lg font-semibold text-white">
        {data.forGuest ? `Make ${data.forGuest} a full account` : "You've been invited"}
      </h2>
      <p className="mt-1 text-sm text-blue-300">
        {data.forGuest
          ? 'Where you left off comes with you, and favorites and playlists open up.'
          : 'Set up how you sign in.'}{' '}
        This invite works until {formatDate(data.expiresAt)}.
      </p>

      <label htmlFor="invite-username" className="mt-5 mb-1 block text-sm text-blue-200">
        Name
      </label>
      <input
        id="invite-username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        className="input mb-1 w-full"
      />
      <p className="mb-4 text-xs text-blue-400">Letters, numbers, dot, dash or underscore.</p>

      <label htmlFor="invite-email" className="mb-1 block text-sm text-blue-200">
        Email
      </label>
      <input
        id="invite-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        className="input mb-1 w-full"
      />
      <p className="mb-4 text-xs text-blue-400">You can sign in with it too. Nothing is sent to it.</p>

      <label htmlFor="invite-password" className="mb-1 block text-sm text-blue-200">
        Password
      </label>
      <PasswordInput
        id="invite-password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
        className="mb-1"
      />
      <p className="mb-4 text-xs text-blue-400">At least {MIN_PASSWORD_LENGTH} characters.</p>

      <label htmlFor="invite-passcode" className="mb-1 block text-sm text-blue-200">
        Passcode <span className="text-blue-400">(optional)</span>
      </label>
      <input
        id="invite-passcode"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value.replace(/\D/g, '').slice(0, 8))}
        inputMode="numeric"
        autoComplete="off"
        className="input mb-1 w-full font-mono tracking-widest"
      />
      <p className="mb-4 text-xs text-blue-400">6 to 8 digits, a quicker way in than your password.</p>

      {error && (
        <p role="alert" className="mb-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !username.trim() || !email.trim() || !password}
        className="btn-primary btn-md w-full"
      >
        {submitting ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  );
}

