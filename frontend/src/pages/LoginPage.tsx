import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ArcadeInterstitial } from '../components/ArcadeInterstitial';
import { BrandLockup } from '../components/BrandLockup';
import { TitleScreenPanel } from '../components/TitleScreenPanel';
import { useThemeCycle } from '../hooks/useThemeCycle';
import { ApiError, getUnlockTicket } from '../lib/apiClient';
import { markJustEntered } from '../lib/boot';
import { interstitialDuration } from '../lib/interstitial';

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
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // True from the moment login succeeds until the navigation actually fires —
  // holds this page on screen for the card below instead of cutting straight
  // to the library the instant `user` updates.
  const [isLeaving, setIsLeaving] = useState(false);
  useThemeCycle();

  // A guest session still counts as `user` — guest entry is the default, open
  // door, so most people tapping the logo already have one. Only a real
  // account signing in twice should skip straight past this form; a guest
  // needs to see it to actually become an admin. `isLeaving` is exempted for
  // the same reason it is below: this component drives its own navigation
  // once login succeeds, and a redirect racing that would skip the card.
  if (user && !user.isGuest && !isLeaving) return <Navigate to="/" replace />;
  if (!isLeaving && !getUnlockTicket()) return <Navigate to="/enter" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);

      // Same card the app uses to leave any screen through, and the same
      // flag guest entry sets before landing in the library — logging in
      // gets the identical arrival, not a bare cut to a different page.
      setIsLeaving(true);
      const wait = interstitialDuration();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      markJustEntered();
      navigate('/', { replace: true });
    } catch (err) {
      // Stay right here and say so — a wrong username or password (or, rarer,
      // an expired unlock ticket; the server answers both identically on
      // purpose) is corrected by retyping, not by being sent back through the
      // numpad. The ticket is left alone so the retry doesn't need one either.
      setError(err instanceof ApiError ? err.message : 'Could not sign in — is the backend running?');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app-ground relative min-h-screen overflow-hidden">
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

      {isLeaving && <ArcadeInterstitial text={`Welcome back, ${username}`} detail="Loading your library" />}
    </div>
  );
}
