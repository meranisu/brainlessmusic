import type { Ref } from 'react';
import { PLAYLIST_NAME_MAX, type PlaylistNameCheck } from '../lib/playlistName';

/**
 * The one name input for playlists: new from the Playlists page, new from "Add to playlist", and rename. Shows the
 * check's error or duplicate warning under the field, and a counter near the limit. The parent owns the value and the
 * check, so it can refuse the save on the same result the field shows.
 */
export function PlaylistNameField({
  id,
  value,
  onChange,
  check,
  serverError,
  label = 'Playlist name',
  placeholder = 'Name it',
  autoFocus,
  inputRef,
  onEscape,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  check: PlaylistNameCheck;
  /** The server's answer to the last save, shown until the name changes. */
  serverError?: string | null;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** Escape in the field: cancel the naming, not whatever dialog holds it. */
  onEscape?: () => void;
}) {
  const error = check.error ?? serverError ?? null;
  const messageId = `${id}-message`;
  const over = check.length > PLAYLIST_NAME_MAX;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onEscape) {
            e.stopPropagation();
            onEscape();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        enterKeyHint="done"
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={`input ${error ? 'border-red-500 focus:border-red-400' : ''}`}
      />
      <div id={messageId} aria-live="polite" className="flex min-h-4 items-start gap-2 text-xs">
        {error ? (
          <span className="flex-1 text-red-300">{error}</span>
        ) : check.warning ? (
          <span className="flex-1 text-accent-ink">{check.warning}</span>
        ) : (
          <span className="flex-1" />
        )}
        {check.showCounter && (
          <span className={`shrink-0 font-mono tabular-nums ${over ? 'text-red-300' : 'text-blue-300'}`}>
            {check.length}/{PLAYLIST_NAME_MAX}
          </span>
        )}
      </div>
    </div>
  );
}
