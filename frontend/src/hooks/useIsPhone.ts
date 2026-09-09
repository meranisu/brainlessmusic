import { useEffect, useState } from 'react';

// Tailwind's `md` breakpoint, as a query rather than a class. Anything below it
// gets the phone layout, so this and `md:` must stay in step.
const PHONE_QUERY = '(max-width: 767px)';

/**
 * True while the viewport is narrow enough for the phone layout.
 *
 * Most of the app switches layouts with `md:` classes alone, which is the right
 * tool when only appearance changes. This exists for the cases where behaviour
 * changes too — a sheet that should not stay open once there is room for the
 * full player, a page that should not stay frozen behind it — because CSS can
 * hide an element but cannot tell React it is gone.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const sync = () => setIsPhone(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return isPhone;
}
