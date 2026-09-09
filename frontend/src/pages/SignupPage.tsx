import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BrandLockup } from '../components/BrandLockup';
import { TitleScreenPanel } from '../components/TitleScreenPanel';
import { ApiError, apiClient } from '../lib/apiClient';

const lightInput =
  'w-full rounded-md border border-blue-950/30 bg-white px-3 py-2 text-sm text-blue-950 outline-none transition-colors placeholder:text-blue-950/40 focus:border-orange-600 disabled:opacity-60';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Account creation. Two ways this page can act:
 *
 *  - the server has no users at all, so the account created here becomes its
 *    admin (the bootstrap case — always allowed, or an admin-only server
 *    could never get its first admin);
 *  - open registration is switched on, so anyone may create a listener
 *    account for themselves.
 *
 * Otherwise registration is admin-only and this page can only explain that.
 * It asks the server which case applies rather than guessing, because only
 * the server knows — and `firstAccount` decides whether we promise admin.
 */
export function SignupPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['registration-status'],
    queryFn: () => apiClient.get<{ open: boolean; firstAccount: boolean }>('/auth/registration-status'),
  });

  const isFirstAccount = data?.firstAccount ?? false;

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/register', { username, password });
      // Sign straight in — asking someone to retype what they just chose is
      // busywork, and this is the account that owns the server.
      await login(username, password);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not create the account — is the backend running?',
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c1a52]">
      <TitleScreenPanel />

      <div
        className="absolute left-0 top-[12%] z-10 flex min-h-[72%] w-full items-center py-6"
        style={{ background: 'linear-gradient(to right, white 0%, white 40%, transparent 94%)' }}
      >
        {/* Orange accents riding the banner's top and bottom edges. */}
        <span className="band-sweep band-sweep-top" />
        <span className="band-sweep band-sweep-bottom" />
        <div className="w-full max-w-sm pl-[6%] pr-6 md:ml-[8%]">
          <BrandLockup
            eyebrow={!data?.open ? 'Accounts' : isFirstAccount ? 'Set up this server' : 'Create an account'}
            className="mb-5"
          />

          {isLoading && <p className="text-sm text-blue-950/60">Checking this server…</p>}

          {data && !data.open && (
            <>
              <p className="mb-4 text-sm text-blue-950/70">
                This server already has an account, so sign-up is closed. New accounts are created by an
                admin from the <span className="font-medium text-blue-950">Users</span> page.
              </p>
              <Link to="/login" className="btn-primary btn-md inline-flex">
                Back to sign in
              </Link>
            </>
          )}

          {data?.open && (
            <form onSubmit={handleSubmit}>
              <p className="mb-3 text-sm text-blue-950/70">
                {isFirstAccount
                  ? 'Nobody has claimed this server yet. The account you create now becomes its admin.'
                  : 'Pick a name and a password and the library is yours to listen to.'}
              </p>

              <label className="mb-1 block text-sm text-blue-950/70" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoFocus
                className={`${lightInput} mb-3`}
              />

              <label className="mb-1 block text-sm text-blue-950/70" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                className={`${lightInput} mb-3`}
              />

              <label className="mb-1 block text-sm text-blue-950/70" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                className={`${lightInput} mb-3`}
              />

              {error && (
                <p className="mb-4 rounded-md border border-red-700 bg-red-700 px-3 py-2 text-sm text-white">
                  {error}
                </p>
              )}

              <button type="submit" disabled={isSubmitting} className="btn-primary btn-md w-full">
                {isSubmitting ? 'Creating…' : isFirstAccount ? 'Create admin account' : 'Create account'}
              </button>

              <p className="mt-4 text-xs text-blue-950/50">
                Already set up?{' '}
                <Link to="/login" className="font-medium text-blue-950/70 underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-[14%] z-10 h-px bg-blue-500/30" />
    </div>
  );
}
