import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BrandLockup } from '../components/BrandLockup';
import { TitleScreenPanel } from '../components/TitleScreenPanel';
import { ApiError, apiClient } from '../lib/apiClient';

const lightInput =
  'w-full rounded-md border border-blue-950/30 bg-white px-3 py-2 text-sm text-blue-950 outline-none transition-colors placeholder:text-blue-950/40 focus:border-orange-600 disabled:opacity-60';

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Only offer sign-up when the server will actually accept one — otherwise
  // the link leads to a page that can only say no. `firstAccount` separates
  // "claim this server" from an ordinary sign-up.
  const { data: registration } = useQuery({
    queryKey: ['registration-status'],
    queryFn: () => apiClient.get<{ open: boolean; firstAccount: boolean }>('/auth/registration-status'),
  });

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in — is the backend running?');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0c1a52]">
      <TitleScreenPanel />

      {/* Wide horizontal content band, left-anchored — solid white behind the
          form, fading to transparent so the mosaic/silhouette animation
          shows through underneath rather than being cut off by a hard edge. */}
      <div
        className="absolute left-0 top-[18%] z-10 flex min-h-[64%] w-full items-center py-10"
        style={{ background: 'linear-gradient(to right, white 0%, white 40%, transparent 94%)' }}
      >
        {/* Orange accents riding the banner's top and bottom edges. */}
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

          {!registration?.open ? (
            <p className="mt-5 text-xs text-blue-950/50">
              No account? Ask an admin — accounts aren't self-serve on this server.
            </p>
          ) : registration.firstAccount ? (
            <p className="mt-5 text-xs text-blue-950/50">
              Nobody has claimed this server yet.{' '}
              <Link to="/signup" className="font-medium text-blue-950/70 underline">
                Create the admin account
              </Link>
              .
            </p>
          ) : (
            <p className="mt-5 text-xs text-blue-950/50">
              No account yet?{' '}
              <Link to="/signup" className="font-medium text-blue-950/70 underline">
                Sign up
              </Link>
              .
            </p>
          )}
        </form>
      </div>

      <div className="absolute inset-x-0 bottom-[14%] z-10 h-px bg-blue-500/30" />
    </div>
  );
}
