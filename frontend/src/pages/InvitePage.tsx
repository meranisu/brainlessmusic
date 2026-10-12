import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ShellBackdrop } from '../components/BackdropDepth';
import { BrandMark, Wordmark } from '../components/BrandLockup';
import { PasswordInput } from '../components/PasswordInput';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatDate } from '../lib/format';

const MIN_PASSWORD_LENGTH = 8;

interface InvitePeek {
  status: 'open' | 'used' | 'expired' | 'revoked';
  expiresAt: string;
  forGuest: string | null;
}

/**
 * Where an invite link lands (A107-A112), reachable signed out. The friend picks a name and password and is signed in;
 * an upgrade link turns the guest it was made for into that account.
 */
export function InvitePage() {
  const { token = '' } = useParams();
  const { adoptToken } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => apiClient.get<InvitePeek>(`/invites/${encodeURIComponent(token)}`),
    retry: false,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiClient.post<{ token: string; username: string }>(
        `/invites/${encodeURIComponent(token)}/accept`,
        { username: username.trim(), password },
      );
      await adoptToken(result.token);
      setDone(result.username);
    } catch (err) {
      setError(err instanceof ApiError ? capitalize(err.message) : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  let body;
  if (done) {
    body = (
      <>
        <h2 className="text-lg font-semibold text-white">You're in, {done}</h2>
        <p className="mt-2 text-sm text-blue-300">
          On the Android app, choose Log in and use the same name and password.
        </p>
        <button onClick={() => navigate('/', { replace: true })} className="btn-primary btn-md mt-5 w-full">
          Start listening
        </button>
      </>
    );
  } else if (isLoading) {
    body = <p className="text-sm text-blue-300">Checking your link…</p>;
  } else if (isError || !data || data.status !== 'open') {
    body = (
      <>
        <h2 className="text-lg font-semibold text-white">This link doesn't work any more</h2>
        <p className="mt-2 text-sm text-blue-300">
          {data?.status === 'used'
            ? 'It has already been used. If that was you, sign in with your name and password.'
            : 'It has expired or was cancelled. Ask for a new one.'}
        </p>
        <Link to="/login" className="btn-secondary btn-md mt-5 w-full text-center">
          Go to sign in
        </Link>
      </>
    );
  } else {
    body = (
      <form onSubmit={onSubmit}>
        <h2 className="text-lg font-semibold text-white">
          {data.forGuest ? `Make ${data.forGuest} a full account` : "You've been invited"}
        </h2>
        <p className="mt-1 text-sm text-blue-300">
          {data.forGuest
            ? 'Pick a name and password. Where you left off comes with you, and favorites and playlists open up.'
            : 'Pick a name and password to sign in with.'}{' '}
          This link works until {formatDate(data.expiresAt)}.
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

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting || !username.trim() || !password} className="btn-primary btn-md w-full">
          {submitting ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
    );
  }

  return (
    <div className="app-ground relative min-h-screen overflow-hidden text-white">
      <ShellBackdrop vivid />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-6 sm:px-6">
        <span className="mb-6 flex items-center gap-3">
          <BrandMark className="h-10 w-10 border-2 border-blue-300 sm:h-12 sm:w-12" />
          <Wordmark className="text-2xl text-white sm:text-3xl" />
        </span>
        <div className="card w-full max-w-md p-6 sm:p-7">{body}</div>
      </div>
    </div>
  );
}

/** Server errors start lower-case ("username already taken"); this page shows them as sentences. */
function capitalize(message: string): string {
  return message.charAt(0).toUpperCase() + message.slice(1);
}
