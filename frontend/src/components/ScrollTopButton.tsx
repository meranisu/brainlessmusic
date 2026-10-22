import { useEffect, useState } from 'react';
import { ArrowUpIcon } from './icons';
import { usePlayer } from './PlayerBar';

/** About a screen and a half on a laptop: past this, the header and the page's top controls are out of reach. */
const SHOW_AFTER_PX = 600;

/**
 * Back to the top of a long page (owner request, 2026-10-11). Flat with a solid border like the player's pills
 * (DESIGN.md: no shadow or glow). Sits above the player bar when one is showing, so it never covers a control.
 */
export function ScrollTopButton() {
  const [visible, setVisible] = useState(false);
  const { current } = usePlayer();

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setVisible(window.scrollY > SHOW_AFTER_PX));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  if (!visible) return null;

  const toTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <button
      onClick={toTop}
      // The player strip is ~60px on a phone, over the tab bar (A274), and the deck ~70px from `md`.
      className={`fixed right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-blue-600 bg-blue-900 text-blue-100 transition-colors hover:border-orange-500 hover:text-white ${
        current ? 'bottom-[calc(5rem+var(--tabbar-h))] md:bottom-24' : 'bottom-[calc(1.5rem+var(--tabbar-h))] md:bottom-6'
      }`}
      aria-label="Back to top"
      title="Back to top"
    >
      <ArrowUpIcon className="h-5 w-5" />
    </button>
  );
}
