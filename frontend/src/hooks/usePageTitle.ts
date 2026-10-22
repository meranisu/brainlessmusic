import { useEffect } from 'react';
import { setDetailTitle } from '../lib/documentTitle';

/** Names this page in the browser tab (A281), over the shell's section name. Null while it loads. */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    setDetailTitle(title ?? null);
    return () => setDetailTitle(null);
  }, [title]);
}
