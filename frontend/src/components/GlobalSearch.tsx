import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface GlobalSearchProps {
  /** Wrapper classes. Defaults to the header bar's fixed-width box. */
  className?: string;
  /** Input classes. Defaults to the header bar's fixed-width field. */
  inputClassName?: string;
  /** Focuses the field the moment it mounts — for the mobile panel, which has
   *  nothing else to focus and appears specifically because someone tapped
   *  the search icon wanting to type. */
  autoFocus?: boolean;
  /** The `/` shortcut hint pinned inside the field. Off for the mobile panel,
   *  where there's no physical row for it to reserve room on and no keyboard
   *  shortcut worth advertising on a touch screen. */
  showShortcutHint?: boolean;
  /** Fires after a submit actually navigates — the mobile panel closes itself
   *  on it, the same way tapping a result would dismiss any other overlay. */
  onNavigate?: () => void;
}

/**
 * Header search box. Submitting navigates to `/search?q=…` rather than holding
 * results in local state, so a search is a real URL — shareable, bookmarkable,
 * and survivable across a reload.
 */
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

  // Keep the box showing whatever the URL says, so arriving at /search?q=x
  // from anywhere — a link, the back button — fills it in.
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
