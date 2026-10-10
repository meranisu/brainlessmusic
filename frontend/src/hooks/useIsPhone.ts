import { useEffect, useState } from 'react';

// Tailwind's `md` breakpoint, as a query rather than a class. Anything below it
// gets the phone layout, so this and `md:` must stay in step.
const PHONE_QUERY = '(max-width: 767px)';

/** True at phone width, for behaviour changes CSS can't express (an element `md:` hides is still mounted). */
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
