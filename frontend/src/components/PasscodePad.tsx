const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface PasscodePadProps {
  /** Digits entered so far — never rendered as text, only as a dot count. */
  code: string;
  maxLength: number;
  disabled?: boolean;
  onPress: (digit: string) => void;
  onBackspace: () => void;
}

/**
 * The digit grid + dots display at the center of every passcode entry —
 * factored out of `Numpad` so the sign-in card can drop the same keypad in
 * below its username field instead of opening a dialog over it. No keyboard
 * handling here: `Numpad` is a full-screen modal with nothing else to type
 * into, so global keydown capture is safe there; inlined next to a username
 * field, it would steal digits meant for that field instead.
 */
export function PasscodePad({ code, maxLength, disabled = false, onPress, onBackspace }: PasscodePadProps) {
  return (
    <div>
      <div
        className="mb-2 flex h-10 items-center justify-center gap-2 rounded-md border border-blue-700 bg-blue-950"
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
            disabled={disabled || code.length >= maxLength}
            onClick={() => onPress(key)}
            className="h-12 rounded-md border border-blue-700 bg-blue-900 text-lg font-medium text-white transition-colors hover:border-blue-500 hover:bg-blue-800 disabled:opacity-50"
          >
            {key}
          </button>
        ))}
        <div />
        <button
          type="button"
          disabled={disabled || code.length >= maxLength}
          onClick={() => onPress('0')}
          className="h-12 rounded-md border border-blue-700 bg-blue-900 text-lg font-medium text-white transition-colors hover:border-blue-500 hover:bg-blue-800 disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || code.length === 0}
          onClick={onBackspace}
          aria-label="Delete last digit"
          className="h-12 rounded-md text-lg font-medium text-blue-400 transition-colors hover:bg-blue-800 hover:text-white disabled:opacity-50"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
