import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { NavLink } from 'react-router-dom';

/** Must match `.options-panel.is-closing` in `index.css`. */
const CLOSE_MS = 160;

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  /** The second line on the arcade card shown on the way in (`ArcadeInterstitial`). */
  detail?: string;
}

interface NavOverflowProps {
  /** What never fits on the bar, at every width. */
  overflow: NavItem[];
  /** The bar's own tabs, repeated here only while the bar is too narrow for them. */
  primary: NavItem[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** A plain click on an item: the shell plays the arcade card and navigates, as the bar's tabs do. */
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, item: NavItem) => void;
  /** Boot-stagger class from the shell, so this arrives with the rest of the bar. */
  className?: string;
}

/**
 * The More menu: `overflow` (admin pages) at every width, plus `primary` tabs below `lg`. The repeated tabs get no
 * underline: a second `nav-underline` name disables the view transition.
 */
export function NavOverflow({ overflow, primary, isOpen, onToggle, onClose, onNavigate, className = '' }: NavOverflowProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  /** Stays mounted for `CLOSE_MS` after closing, so the menu shrinks back into its button. */
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

  /* From `lg` this button only serves `overflow`, so it hides when that's empty (Listen together keeps it filled for
     everyone today). Below `lg` it's a phone's tabs. */
  const emptyAtDesktop = overflow.length === 0 ? 'lg:hidden' : '';

  return (
    <div className={`relative shrink-0 ${emptyAtDesktop} ${className}`}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        /* The tabs' shape, with the search box's border: the bar's two controls that open something look paired. */
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
          {/* Centred under the button. Two boxes: the entrance animates `transform`, which would undo the centring
              translate on one element. `max-width` keeps it inside a phone's viewport. */}
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
                  <div className="flex flex-col gap-1">
                    {primary.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={(event) => {
                          onClose();
                          onNavigate(event, item);
                        }}
                        className={itemClass}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                  <div className="my-2 border-t border-blue-800" />
                </div>
              )}
              {/* A gap so neighbouring highlights (hover next to the active page) read as two rows. */}
              <div className="flex flex-col gap-1">
                {overflow.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={(event) => {
                      onClose();
                      onNavigate(event, item);
                    }}
                    className={itemClass}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
