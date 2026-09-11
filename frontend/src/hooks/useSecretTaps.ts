import { useCallback, useRef } from 'react';

/**
 * Fires after `count` taps that each land within `gapMs` of the one before.
 *
 * The gap is what makes this a deliberate gesture rather than a trap: a child
 * mashing the logo, or a double-click that turns into a triple, never reaches
 * seven in a row at a steady rhythm and then stops. Letting the streak lapse
 * resets it to a single tap — the one just made — rather than to zero, so an
 * interrupted attempt does not have to be started from nothing.
 *
 * Returns a handler to spread onto whatever should carry the gesture. Nothing
 * about the element it lands on may hint that it is there.
 */
export function useSecretTaps(onTrigger: () => void, count = 7, gapMs = 1500): () => void {
  const taps = useRef(0);
  const lastTapAt = useRef(0);

  return useCallback(() => {
    const now = Date.now();
    taps.current = now - lastTapAt.current <= gapMs ? taps.current + 1 : 1;
    lastTapAt.current = now;

    if (taps.current >= count) {
      taps.current = 0;
      onTrigger();
    }
  }, [onTrigger, count, gapMs]);
}
