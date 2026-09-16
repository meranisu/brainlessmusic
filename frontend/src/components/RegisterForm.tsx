import { useState, type FormEvent } from 'react';
import type { User } from '../types/api';
import { PasswordInput } from './PasswordInput';

const MIN_PASSWORD_LENGTH = 8;

interface RegisterFormProps {
  /**
   * Does the actual work — register, then sign in as the new account. Throw
   * to show an error (the thrown `Error`'s `message` is what's displayed).
   */
  onSubmit: (input: { username: string; password: string }) => Promise<User>;
  onSuccess: (user: User) => void;
  onCancel: () => void;
  disabled: boolean;
  className?: string;
}

/**
 * "Create a new profile" — a save-file sign-in card, but for an account that
 * doesn't exist yet. Rendered inline in place of the two-card grid (see
 * `AccountSelectPage`'s `showRegister` branch) rather than as a dialog over
 * it, the same way the passcode-setup prompt takes over the page instead of
 * popping up on top of it.
 *
 * No passcode field here — a fresh account has no passcode either way, and
 * `AccountSelectPage` already has a step for that: on success it runs
 * through the exact same "want a faster way back in?" prompt a first
 * password login gets, rather than this form asking the same question a
 * second way.
 */
export function RegisterForm({ onSubmit, onSuccess, onCancel, disabled, className = '' }: RegisterFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting || disabled) return;

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const user = await onSubmit({ username, password });
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className} aria-label="Create a new profile">
      <p className="text-sm text-blue-300">Register a new account on this server.</p>

      <label className="mb-1 mt-4 block text-sm text-blue-200" htmlFor="register-username">
        Username
      </label>
      <input
        id="register-username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        required
        disabled={disabled || isSubmitting}
        className="input"
      />

      <label className="mb-1 mt-4 block text-sm text-blue-200" htmlFor="register-password">
        Password
      </label>
      <PasswordInput
        id="register-password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
        disabled={disabled || isSubmitting}
      />
      <p className="mt-1 text-xs text-blue-400">At least {MIN_PASSWORD_LENGTH} characters.</p>

      <label className="mb-1 mt-4 block text-sm text-blue-200" htmlFor="register-confirm-password">
        Confirm password
      </label>
      <PasswordInput
        id="register-confirm-password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        required
        disabled={disabled || isSubmitting}
      />

      {error && (
        <p className="mt-3 rounded-md border border-red-700 bg-red-700 px-3 py-2 text-sm text-white">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting || disabled || username.length === 0 || password.length === 0}
          className="btn-primary btn-md flex-1"
        >
          {isSubmitting ? 'Creating…' : 'Create profile'}
        </button>
        <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn-secondary btn-md">
          Cancel
        </button>
      </div>
    </form>
  );
}
