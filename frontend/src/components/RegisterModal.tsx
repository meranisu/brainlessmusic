import { useCallback, useState, type FormEvent } from 'react';
import type { User } from '../types/api';
import { PasscodePad } from './PasscodePad';

/** Must match `.numpad-*.is-closing` in `index.css`. */
const CLOSE_MS = 160;

const MIN_PASSWORD_LENGTH = 8;
const MIN_PASSCODE_LENGTH = 4;

interface RegisterModalProps {
  /**
   * Does the actual work — register, then sign in as the new account. Throw
   * to show an error (the thrown `Error`'s `message` is what's displayed).
   */
  onSubmit: (input: { username: string; password: string; passcode: string }) => Promise<User>;
  onSuccess: (user: User) => void;
  onDismiss: () => void;
}

/**
 * "Create a new profile" — a save-file sign-in card, but for an account that
 * doesn't exist yet. Only ever mounted when the server says registration is
 * open (`GET /auth/registration-status`), so there's no need to re-check that
 * here; a closed server simply never renders the button that opens this.
 *
 * The passcode field is optional and entered up front rather than as a
 * second step afterward, the way the sign-in card's first-login prompt does
 * it — there's no "next time" to defer to yet, this *is* the first time.
 */
export function RegisterModal({ onSubmit, onSuccess, onDismiss }: RegisterModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const dismiss = useCallback(() => {
    setIsClosing(true);
    setTimeout(onDismiss, CLOSE_MS);
  }, [onDismiss]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (passcode.length > 0 && passcode.length < MIN_PASSCODE_LENGTH) {
      setError(`Passcode must be at least ${MIN_PASSCODE_LENGTH} digits, or left blank.`);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const user = await onSubmit({ username, password, passcode });
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className={`numpad-scrim fixed inset-0 z-50 flex items-center justify-center bg-blue-950/90 p-4 ${
        isClosing ? 'is-closing' : ''
      }`}
    >
      <form
        onSubmit={handleSubmit}
        className={`numpad-panel card w-full max-w-sm p-5 ${isClosing ? 'is-closing' : ''}`}
        aria-label="Create a new profile"
      >
        <p className="mb-3 text-center text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-300">
          Create a new profile
        </p>

        <label className="mb-1 block text-sm text-blue-200" htmlFor="register-username">
          Username
        </label>
        <input
          id="register-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          disabled={isSubmitting}
          className="input mb-4"
        />

        <label className="mb-1 block text-sm text-blue-200" htmlFor="register-password">
          Password
        </label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={isSubmitting}
          className="input"
        />
        <p className="mb-4 mt-1 text-xs text-blue-400">At least {MIN_PASSWORD_LENGTH} characters.</p>

        <label className="mb-1 block text-sm text-blue-200">Passcode (optional)</label>
        <p className="mb-2 text-xs text-blue-400">
          A shortcut back in, instead of typing your password. Skip it and add one later from Options.
        </p>
        <PasscodePad
          code={passcode}
          maxLength={8}
          disabled={isSubmitting}
          onPress={(digit) => setPasscode((c) => (c.length >= 8 ? c : c + digit))}
          onBackspace={() => setPasscode((c) => c.slice(0, -1))}
        />

        {error && (
          <p className="mt-3 rounded-md bg-red-700 px-3 py-2 text-center text-xs text-white">{error}</p>
        )}

        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full rounded-md py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-800 hover:text-white"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={isSubmitting || username.length === 0 || password.length === 0}
          className="btn-primary btn-md mt-2 w-full"
        >
          {isSubmitting ? 'Creating…' : 'Create profile'}
        </button>
      </form>
    </div>
  );
}
