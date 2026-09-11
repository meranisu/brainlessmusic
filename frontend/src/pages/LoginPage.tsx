import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BrandLockup } from '../components/BrandLockup';
import { TitleScreenPanel } from '../components/TitleScreenPanel';
import { ApiError, getUnlockTicket, setUnlockTicket } from '../lib/apiClient';

const lightInput =
  'w-full rounded-md border border-blue-950/30 bg-white px-3 py-2 text-sm text-blue-950 outline-none transition-colors placeholder:text-blue-950/40 focus:border-orange-600 disabled:opacity-60';

/**
 * The administrator sign-in. Reached through the title screen's tap gesture and
 * numpad, not through a link — but reachable by URL, and that is fine.
 *
 * **What protects this page is not where it is.** A single-page app ships its
 * route table to everyone, and `POST /auth/login` answers `curl` whatever this
 * component draws. The ticket check below is therefore a courtesy — it keeps a
 * guest who wandered here from staring at a form they cannot use — while the
 * real refusal happens on the server, which rejects a login carrying no unlock
 * ticket while `ADMIN_ENTRY_CODE` is set. Deleting this redirect would weaken
 * nothing except the tidiness.
 */
export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;
  if (!getUnlockTicket()) return <Navigate to="/enter" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      // A server with ADMIN_ENTRY_CODE set answers a stale ticket exactly as it
      // answers a wrong password, so this cannot tell the two apart and does
      // not pretend to. Dropping the ticket sends the next attempt back through
      // the numpad, which is the recovery either way.
      if (err instanceof ApiError && err.status === 401) setUnlockTicket(null);
      setError(err instanceof ApiError ? err.message : 'Could not sign in — is the backend running?');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c1a52]">
      <TitleScreenPanel />

      <div
        className="absolute left-0 top-[18%] z-10 flex min-h-[64%] w-full items-center py-10"
        style={{ background: 'linear-gradient(to right, white 0%, white 40%, transparent 94%)' }}
      >
        <span className="band-sweep band-sweep-top" />
        <span className="band-sweep band-sweep-bottom" />
        <form onSubmit={handleSubmit} className="w-full max-w-sm pl-[6%] pr-6 md:ml-[8%]">
          <BrandLockup eyebrow="Sign in to the control room" className="mb-6" />

          <label className="mb-1 block text-sm text-blue-950/70" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className={`${lightInput} mb-4`}
          />

          <label className="mb-1 block text-sm text-blue-950/70" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className={`${lightInput} mb-4`}
          />

          {error && (
            <p className="mb-4 rounded-md border border-red-700 bg-red-700 px-3 py-2 text-sm text-white">{error}</p>
          )}

          <button type="submit" disabled={isSubmitting} className="btn-primary btn-md w-full">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="mt-5 text-xs text-blue-950/50">
            Accounts aren't self-serve on this server.{' '}
            <Link to="/enter" className="font-medium text-blue-950/70 underline">
              Go back
            </Link>
            .
          </p>
        </form>
      </div>

      <div className="absolute inset-x-0 bottom-[14%] z-10 h-px bg-blue-500/30" />
    </div>
  );
}
