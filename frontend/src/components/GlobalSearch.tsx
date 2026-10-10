import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface GlobalSearchProps {
  /** Wrapper classes. Defaults to the header bar's fixed-width box. */
  className?: string;
  /** Input classes. Defaults to the header bar's fixed-width field. */
  inputClassName?: string;
  /** Focus on mount, for the mobile panel. */
  autoFocus?: boolean;
  /** The `/` shortcut hint; off on touch screens. */
  showShortcutHint?: boolean;
  /** After a submit navigates; the mobile panel closes on it. */
  onNavigate?: () => void;
}

/** Header search. Submitting goes to `/search?q=…`, so a search is a real URL. */
export function GlobalSearch({
  className = 'relative ml-auto',
  inputClassName = 'input w-40 select-text py-1.5 pr-8 text-sm xl:w-56',
  autoFocus = false,
  showShortcutHint = true,
  onNavigate,
}: GlobalSearchProps = {}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(params.get('q') ?? '');

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Mirrors the URL, so arriving at /search?q=x by any route fills the box.
  const urlQuery = params.get('q') ?? '';
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key !== '/') return;
      const target = ev.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      ev.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) {
          navigate(`/search?q=${encodeURIComponent(trimmed)}`);
          onNavigate?.();
        }
      }}
      className={className}
      role="search"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search…"
        aria-label="Search the library"
        className={inputClassName}
      />
      {/* The shortcut hint, hidden once there's text so it never sits on top
          of what someone is typing. */}
      {showShortcutHint && value === '' && (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-blue-700 px-1.5 py-0.5 font-mono text-[10px] leading-none text-blue-400"
        >
          /
        </kbd>
      )}
    </form>
  );
}
