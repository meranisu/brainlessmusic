import { useEffect } from 'react';

/**
 * Freeze the document behind a modal overlay for as long as the calling
 * component is mounted (or `enabled` stays true).
 *
 * `overflow: hidden` on its own is not enough: iOS Safari keeps
 * touch-scrolling the page underneath regardless. Pinning the body with
 * `position: fixed` at a negative offset is the technique that holds
 * everywhere, at the cost of having to put the scroll position back by hand
 * when the last lock lifts.
 *
 * Pinning the body also collapses the document height, so the scrollbar
 * disappears and the page reflows by its width. `html { scrollbar-gutter:
 * stable }` in index.css reserves that space permanently, which is why there
 * is no measure-and-pad dance here.
 */

// Locks are reference-counted at module scope rather than per-component: a
// confirm dialog opened on top of the track drawer must not unfreeze the page
// when only the dialog closes. The first lock records where we were, the last
// one puts us back.
let lockCount = 0;
let savedScrollY = 0;

function lock(): void {
  if (lockCount++ > 0) return;
  savedScrollY = window.scrollY;
  const { style } = document.body;
  style.position = 'fixed';
  style.top = `-${savedScrollY}px`;
  style.left = '0';
  style.right = '0';
}

function unlock(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;
  const { style } = document.body;
  style.position = '';
  style.top = '';
  style.left = '';
  style.right = '';
  window.scrollTo(0, savedScrollY);
}

export function useScrollLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    lock();
    return unlock;
  }, [enabled]);
}
