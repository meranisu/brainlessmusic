import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

/** Must match `.options-panel.is-closing` in `index.css`. */
const CLOSE_MS = 160;

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

interface NavOverflowProps {
  /** Everything that never fits on the bar — shown at every width. */
  overflow: NavItem[];
  /** The bar's own tabs, repeated here only while the bar is too narrow for them. */
  primary: NavItem[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Boot-stagger class from the shell, so this arrives with the rest of the bar. */
  className?: string;
}

/**
 * The bar's "More" menu.
 *
 * Two lists rather than one, because the bar collapses in stages. `overflow`
 * holds what is behind the menu at any width — Upload, Users and Health, which
 * are administrative or occasional. `primary` holds the real tabs, and appears
 * here **only below `lg`**, where the bar has no room for them at all: five
 * tabs measure roughly 375px before the wordmark, the search box or a single
 * button, against a 390px phone — and still overflowed a 768px tablet when the
 * breakpoint was `md`.
 *
 * The repeated entries carry no underline of their own. Exactly one element in
 * the document may hold `view-transition-name: nav-underline`, and a second one
 * does not merely look wrong — a duplicated name disables the transition for
 * the entire page.
 */
export function NavOverflow({ overflow, primary, isOpen, onToggle, onClose, className = '' }: NavOverflowProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  /**
   * `isOpen` flips to `false` the instant the parent decides to close — a
   * click outside, Escape, a tab away — which used to unmount this straight
   * away and skip `.options-panel.is-closing`'s reverse of the entrance
   * animation entirely. Staying mounted for one more `CLOSE_MS` is what lets
   * it play: the menu that grew in now shrinks back to the button it came
   * from instead of just disappearing.
   */
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      setIsClosing(true);
      const timer = setTimeout(() => setIsClosing(false), CLOSE_MS);
      wasOpen.current = isOpen;
      return () => clearTimeout(timer);
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  const visible = isOpen || isClosing;

  useEffect(() => {
    if (!visible) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-orange-600/15 text-orange-300'
        : 'text-blue-200 hover:bg-orange-500/12 hover:text-orange-300'
    }`;

  /* Once the bar itself has room for the primary tabs (`lg` and up), the
     only reason this button exists is `overflow` — for a guest, who has none,
     it would sit there opening a menu with nothing admin in it and nothing
     else, since `primary`'s copy inside is `lg:hidden` too. Below `lg`, where
     the bar shows no tabs at all, it stays for everyone: it's the only way a
     guest on a phone reaches Library, Albums, Artists, Favorites or
     Playlists. */
  const emptyAtDesktop = overflow.length === 0 ? 'lg:hidden' : '';

  return (
    <div className={`relative shrink-0 ${emptyAtDesktop} ${className}`}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        /* `.nav-tab`, the same shape the tabs wear. It used to be a `btn-sm`,
           which put a smaller, lighter, differently-padded control in the
           middle of a row that reads as one strip.

           The border is the same `border-blue-700` the search box wears
           beside it — the only two controls on the bar that open something
           (a menu, a query) get the same outline, so they read as a pair of
           inputs rather than one bordered box next to a bare label. */
        className="nav-tab border border-blue-700"
      >
        More
        <span aria-hidden className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {visible && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
          {/* Centred under the button rather than hung off its right edge — a
              menu whose only item sat well to the left of the control that
              opened it read as belonging to something else.

              Two elements, and that is not incidental. The centring is
              `-translate-x-1/2`, and `.options-panel`'s entrance animates
              `transform` — so on one element the keyframe would overwrite the
              centring for the whole 180ms and the menu would fly in from half
              its own width to the right. The outer box positions and never
              animates; the inner box animates and never positions.

              `max-width` is the guard: the button sits near the left on a
              phone, where centring a 13rem panel would push it past the
              viewport edge and give the page a horizontal scrollbar — the exact
              fault this bar rebuild exists to remove. */}
          <div className="absolute left-1/2 top-full z-50 mt-2 w-52 max-w-[calc(100vw-1.5rem)] -translate-x-1/2">
            <div
              ref={menuRef}
              role="menu"
              className={`options-panel card w-full p-2 ${isClosing ? 'is-closing' : ''}`}
            >
            {/* Below `md` the bar shows no tabs at all, so they live here. The
                divider only appears when both groups are on screen. */}
              {primary.length > 0 && (
                <div className="lg:hidden">
                  {primary.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} onClick={onClose} className={itemClass}>
                      {item.label}
                    </NavLink>
                  ))}
                  <div className="my-2 border-t border-blue-800" />
                </div>
              )}
              {overflow.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={onClose} className={itemClass}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
