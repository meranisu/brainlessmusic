import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../lib/interstitial';

export type PresenceState = 'open' | 'closing';

/**
 * Keeps a closing element mounted long enough to animate out. While `value` is set it is returned as `item` with
 * state `open`. When it clears, the last value stays for `exitMs` with state `closing`, then `item` becomes null.
 * Under reduced motion the exit is skipped, so the element is simply gone.
 */
export function usePresence<T>(value: T | null | undefined | false, exitMs: number) {
  const live = value === null || value === undefined || value === false ? null : value;
  const [last, setLast] = useState<T | null>(live);
  const [mounted, setMounted] = useState(live !== null);

  // Adjusted during render, not in an effect, so the held value is never a frame behind.
  if (live !== null && last !== live) setLast(live);
  if (live !== null && !mounted) setMounted(true);

  const isLive = live !== null;
  useEffect(() => {
    if (isLive) return;
    const t = setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : exitMs);
    return () => clearTimeout(t);
  }, [isLive, exitMs]);

  if (live !== null) return { item: live, state: 'open' as PresenceState };
  if (mounted && last !== null && !prefersReducedMotion()) return { item: last, state: 'closing' as PresenceState };
  return { item: null, state: 'open' as PresenceState };
}
