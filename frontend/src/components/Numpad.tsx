import { useCallback, useEffect, useState, type FormEvent } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Must match `.numpad-*.is-closing` in `index.css`. */
const CLOSE_MS = 160;

interface NumpadProps {
  /** What this dialog is for — "Enter passcode", "Create a passcode", and so on. */
  title: string;
  /** Continue stays disabled below this many digits. */
  minLength?: number;
  maxLength?: number;
  submitLabel?: string;
  /** Label shown on the button while `onSubmit` is in flight. */
  submittingLabel?: string;
  /**
   * Does the actual work — a network call, typically. Throw to show an error
   * (the thrown `Error`'s `message` is what's displayed) and clear the
   * entry; resolve to signal success.
   */
  onSubmit: (code: string) => Promise<void>;
  onSuccess: () => void;
  onDismiss: () => void;
}

/**
 * A numeric keypad dialog — first built for the admin entry code, now the
 * shared shape behind every short-code entry in the app (passcode sign-in,
 * creating or changing a passcode). The interaction is generic; the caller's
 * `onSubmit` is the only thing that actually knows what the code is for.
 *
 * Built as a keypad rather than a text input on purpose: this is the one
 * control on the screen that has to work with a thumb on a phone and a mouse
 * on a desktop, and a numeric `<input>` summons a keyboard that covers half
 * the screen it is standing on.
 */
export function Numpad({
  title,
  minLength = 1,
  maxLength = 8,
  submitLabel = 'Continue',
  submittingLabel = 'Checking…',
  onSubmit,
  onSuccess,
  onDismiss,
}: NumpadProps) {
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
  const dismiss = useCallback(() => {
    setIsClosing(true);
    setTimeout(onDismiss, CLOSE_MS);
  }, [onDismiss]);

  function press(key: string) {
    setError(null);
    setCode((current) => (current.length >= maxLength ? current : current + key));
  }

  const submit = useCallback(async () => {
    if (isSubmitting || code.length < minLength) return;
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(code);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setCode('');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, code, minLength, onSubmit, onSuccess]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submit();
  }

  // The grid is drawn for a thumb, but a desktop with a keyboard attached
  // shouldn't be forced to click through it one digit at a time. Scoped to
  // this component's lifetime, so it never competes with input elsewhere —
  // the numpad is a full-screen modal and the only thing on screen while it's up.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isSubmitting) return;
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        press(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        setCode((current) => current.slice(0, -1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, submit, dismiss]);

  return (
    <div
      className={`numpad-scrim fixed inset-0 z-50 flex items-center justify-center bg-blue-950/90 p-4 ${
        isClosing ? 'is-closing' : ''
      }`}
    >
      <form
        onSubmit={handleSubmit}
        className={`numpad-panel card w-full max-w-[19rem] p-5 ${isClosing ? 'is-closing' : ''}`}
        aria-label={title}
      >
        <p className="mb-3 text-center text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-300">
          {title}
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
          disabled={isSubmitting || code.length < minLength}
          className="btn-primary btn-md mt-3 w-full"
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </form>
    </div>
  );
}
