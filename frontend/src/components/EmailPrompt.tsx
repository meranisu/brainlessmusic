import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useScrollLock } from '../hooks/useScrollLock';
import { sentence } from '../lib/accountRules';
import { ApiError, apiClient } from '../lib/apiClient';

/** "Later" lasts for this browser session; the next one asks again (A190). */
const LATER_KEY = 'emailPromptLater';

function laterChosen(userId: number): boolean {
  try {
    return sessionStorage.getItem(LATER_KEY) === String(userId);
  } catch {
    return false;
  }
}

/** Asks an account made before emails (A189-A190) for one. Guests are never asked. */
export function EmailPrompt() {
  const { user } = useAuth();
  const [laterFor, setLaterFor] = useState<number | null>(null);

  if (!user || user.isGuest || user.email !== null) return null;
  if (laterFor === user.id || laterChosen(user.id)) return null;

  function later() {
    try {
      sessionStorage.setItem(LATER_KEY, String(user!.id));
    } catch {
      // Private mode: it just asks again on the next load.
    }
    setLaterFor(user!.id);
  }

  return <EmailDialog onLater={later} />;
}

function EmailDialog({ onLater }: { onLater: () => void }) {
  useScrollLock();
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiClient.put('/me/email', { email: email.trim() });
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? sentence(err.message) : 'Could not save it. Try again.');
      setSaving(false);
    }
  }

  return (
    <div className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        role="dialog"
        aria-labelledby="email-prompt-heading"
        onSubmit={onSubmit}
        className="motion-pop card w-full max-w-sm p-5"
      >
        <h2 id="email-prompt-heading" className="text-sm font-semibold text-white">
          Add your email
        </h2>
        <p className="mt-2 text-xs text-blue-300">
          Your account doesn't have one yet. You'll be able to sign in with it, and later reset a forgotten password.
          Nothing is sent to it for now.
        </p>
        <label htmlFor="email-prompt-input" className="mt-4 mb-1 block text-sm text-blue-200">
          Email
        </label>
        <input
          id="email-prompt-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          className="input w-full"
        />
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onLater} className="btn-secondary btn-sm">
            Later
          </button>
          <button type="submit" disabled={saving || !email.trim()} className="btn-primary btn-sm">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
