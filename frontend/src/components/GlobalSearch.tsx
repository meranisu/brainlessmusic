import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Header search box. Submitting navigates to `/search?q=…` rather than holding
 * results in local state, so a search is a real URL — shareable, bookmarkable,
 * and survivable across a reload.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(params.get('q') ?? '');

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
        if (trimmed) navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
      className="relative ml-auto"
      role="search"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search…"
        aria-label="Search the library"
        className="input w-40 select-text py-1.5 pr-8 text-sm xl:w-56"
      />
      {/* The shortcut hint, hidden once there's text so it never sits on top
          of what someone is typing. */}
      {value === '' && (
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
