import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from './icons';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  /** Applied to the wrapper, for margins like `mb-4`. */
  className?: string;
}

/** A password input with a show/hide toggle. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  required,
  disabled,
  className = '',
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className="input pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-blue-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
