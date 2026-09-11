import { useState, type FormEvent } from 'react';
import { ApiError, apiClient, setUnlockTicket } from '../lib/apiClient';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MAX_LENGTH = 12;

/** Must match `.numpad-*.is-closing` in `index.css`. */
const CLOSE_MS = 160;

interface AdminNumpadProps {
  onUnlocked: () => void;
  onDismiss: () => void;
}

/**
 * The panel behind the title screen's tap gesture. Collects a code and sends
 * it to `POST /auth/unlock`, which is where it is actually checked — comparing
 * it here would ship the secret to every guest's browser inside the bundle,
 * and the endpoint answers `curl` whatever this component draws.
 *
 * Built as a keypad rather than a text input on purpose: this is the one
 * control on the screen that has to work with a thumb on a phone and a mouse
 * on a desktop, and a numeric `<input>` summons a keyboard that covers half
 * the screen it is standing on.
 */
export function AdminNumpad({ onUnlocked, onDismiss }: AdminNumpadProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  /**
   * Plays the exit before telling the parent to unmount, because the parent
   * unmounting is what removes this from the DOM — there is nothing left to
   * animate afterwards. The panel and its backdrop leave together; a dialog
   * that vanishes while its ground fades reads as a crash rather than a close.
   */
  function dismiss() {
    setIsClosing(true);
    setTimeout(onDismiss, CLOSE_MS);
  }

  function press(key: string) {
    setError(null);
    setCode((current) => (current.length >= MAX_LENGTH ? current : current + key));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { ticket } = await apiClient.post<{ ticket: string }>('/auth/unlock', { code });
      setUnlockTicket(ticket);
      onUnlocked();
    } catch (err) {
      // 429 is the lockout, and says something different from a wrong code —
      // "try again" is useless advice when the answer is "not for a minute".
      setError(
        err instanceof ApiError
          ? err.status === 429
            ? 'Too many tries. Wait a minute.'
            : 'That code is not right.'
          : 'Could not reach the server.',
      );
      setCode('');
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
        className={`numpad-panel card w-full max-w-[19rem] p-5 ${isClosing ? 'is-closing' : ''}`}
        aria-label="Administrator code"
      >
        <p className="mb-3 text-center text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-300">
          Enter code
        </p>

        {/* The code itself is never echoed — a keypad held up at arm's length
            in a room with other people is the normal case, not the exception. */}
        <div
          className="mb-4 flex h-10 items-center justify-center gap-2 rounded-md border border-blue-700 bg-blue-950"
          aria-live="polite"
          aria-label={`${code.length} digits entered`}
        >
          {code.length === 0 ? (
            <span className="text-sm text-blue-500">– – – – – –</span>
          ) : (
            Array.from({ length: code.length }).map((_, i) => (
              <span key={i} className="h-2 w-2 rounded-full bg-orange-600" />
            ))
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              className="h-14 rounded-md border border-blue-700 bg-blue-900 text-lg font-medium text-white transition-colors hover:border-blue-500 hover:bg-blue-800"
            >
              {key}
            </button>
          ))}
          <button
            type="button"
            onClick={dismiss}
            className="h-14 rounded-md text-xs font-medium text-blue-400 transition-colors hover:bg-blue-800 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => press('0')}
            className="h-14 rounded-md border border-blue-700 bg-blue-900 text-lg font-medium text-white transition-colors hover:border-blue-500 hover:bg-blue-800"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setCode((current) => current.slice(0, -1))}
            aria-label="Delete last digit"
            className="h-14 rounded-md text-lg font-medium text-blue-400 transition-colors hover:bg-blue-800 hover:text-white"
          >
            ⌫
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-red-700 px-3 py-2 text-center text-xs text-white">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting || code.length === 0}
          className="btn-primary btn-md mt-3 w-full"
        >
          {isSubmitting ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
