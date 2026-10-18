import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PasscodePad } from './PasscodePad';
import { useToast } from './ToastProvider';

/** Must match `.numpad-*.is-closing` in `index.css`. */
const CLOSE_MS = 160;

interface NumpadProps {
  /** What the dialog is for, e.g. "Enter passcode". */
  title: string;
  /** Below this many digits the button is refused with a toast, not hidden behind a dead button. */
  minLength?: number;
  maxLength?: number;
  submitLabel?: string;
  /** Label shown on the button while `onSubmit` is in flight. */
  submittingLabel?: string;
  /** Does the work. Throw to show the error's message and clear the entry; resolve for success. */
  onSubmit: (code: string) => Promise<void>;
  onSuccess: () => void;
  onDismiss: () => void;
}

/** A keypad dialog for every short-code entry. A keypad, not an input, so no phone keyboard covers the screen. */
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
  const [refusals, setRefusals] = useState(0);
  const { showToast } = useToast();

  /** Plays the exit before the parent unmounts this; panel and backdrop leave together. */
  const dismiss = useCallback(() => {
    setIsClosing(true);
    setTimeout(onDismiss, CLOSE_MS);
  }, [onDismiss]);

  function press(key: string) {
    setError(null);
    setCode((current) => (current.length >= maxLength ? current : current + key));
  }

  const submit = useCallback(async () => {
    if (isSubmitting) return;
    if (code.length < minLength) {
      showToast(`Use ${minLength} to ${maxLength} digits.`, 'error');
      setRefusals((n) => n + 1);
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(code);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setRefusals((n) => n + 1);
      setCode('');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, code, minLength, maxLength, onSubmit, onSuccess, showToast]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submit();
  }

  // Digits from a physical keyboard too. Safe because the numpad is a full-screen modal.
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

        {/* Never echoed: a keypad is often held up in a room with others. */}
        <PasscodePad
          code={code}
          maxLength={maxLength}
          disabled={isSubmitting}
          refusals={refusals}
          onPress={press}
          onBackspace={() => setCode((current) => current.slice(0, -1))}
        />

        <button
          type="button"
          onClick={dismiss}
          className="mt-2 w-full rounded-md py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-800 hover:text-white"
        >
          Cancel
        </button>

        {error && (
          <p key={refusals} className="pad-notice mt-3 rounded-md bg-red-700 px-3 py-2 text-center text-xs text-white">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary btn-md mt-3 w-full"
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </form>
    </div>
  );
}
