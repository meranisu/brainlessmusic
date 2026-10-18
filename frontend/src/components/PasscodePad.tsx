const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface PasscodePadProps {
  /** Digits so far, shown only as dots. */
  code: string;
  maxLength: number;
  disabled?: boolean;
  /** Goes up by one on each refused code, so the tray shakes again even for the same message. */
  refusals?: number;
  onPress: (digit: string) => void;
  onBackspace: () => void;
}

/**
 * The digit grid and dots, shared by `Numpad` and the inline sign-in card. No key capture: inline, it would steal
 * digits from the username field. Small, so the sign-in card fits without scrolling.
 */
export function PasscodePad({ code, maxLength, disabled = false, refusals = 0, onPress, onBackspace }: PasscodePadProps) {
  return (
    <div className="pad-enter">
      <div
        key={refusals}
        className={`pad-tray mb-1 flex h-7 items-center justify-center gap-2 rounded-md border border-blue-700 bg-blue-950${refusals > 0 ? ' is-refused' : ''}`}
        aria-live="polite"
        aria-label={`${code.length} digits entered`}
      >
        {code.length === 0 ? (
          <span className="text-sm text-blue-500">– – – – – –</span>
        ) : (
          Array.from({ length: code.length }).map((_, i) => (
            <span key={i} className="pad-dot h-2 w-2 rounded-full bg-orange-600" />
          ))
        )}
      </div>

      <div className="grid grid-cols-3 gap-1">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={disabled || code.length >= maxLength}
            onClick={() => onPress(key)}
            className="pad-key h-8 rounded-md border border-blue-700 bg-blue-900 text-sm font-medium text-white hover:border-blue-500 hover:bg-blue-800 disabled:opacity-50"
          >
            {key}
          </button>
        ))}
        <div />
        <button
          type="button"
          disabled={disabled || code.length >= maxLength}
          onClick={() => onPress('0')}
          className="pad-key h-8 rounded-md border border-blue-700 bg-blue-900 text-sm font-medium text-white hover:border-blue-500 hover:bg-blue-800 disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled || code.length === 0}
          onClick={onBackspace}
          aria-label="Delete last digit"
          className="pad-key h-8 rounded-md text-sm font-medium text-blue-400 hover:bg-blue-800 hover:text-white disabled:opacity-50"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
