import { useEffect } from 'react';

/**
 * Freezes the page behind a modal while mounted. Pins the body with `position: fixed` (iOS ignores `overflow: hidden`)
 * and restores the scroll after; `scrollbar-gutter: stable` in index.css prevents the reflow.
 */

// Reference-counted at module scope, so closing a dialog over the drawer doesn't unfreeze the page.
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
