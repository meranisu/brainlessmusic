import type { ReactNode } from 'react';
import { usePresence } from '../hooks/usePresence';

interface PresenceProps<T> {
  /** Truthy mounts the child. Falsy unmounts it after the exit animation, still rendering the last value. */
  value: T | null | undefined | false;
  exitMs?: number;
  children: (value: T) => ReactNode;
}

/** `display: contents`, so it adds no box. While closing, CSS under `[data-presence='closing']` plays the exit. */
export function Presence<T>({ value, exitMs = 240, children }: PresenceProps<T>) {
  const { item, state } = usePresence(value, exitMs);
  if (item === null) return null;
  return (
    <div data-presence={state} inert={state === 'closing'} style={{ display: 'contents' }}>
      {children(item)}
    </div>
  );
}
