import { useEffect, useRef, useState } from 'react';

interface Loaded {
  key: string;
  url: string | null;
  failed: boolean;
}

/**
 * Resolves a media URL that needs a token (`<img>` can't send a header). `key` names what is shown; a result for an
 * older key reads as "not loaded yet", so a changed key shows the placeholder without a reset effect. A null key loads
 * nothing. `fail()` marks the current URL as broken, e.g. from an `<img onError>`.
 */
export function useMediaUrl(key: string | null, build: () => Promise<string>) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const buildRef = useRef(build);

  useEffect(() => {
    buildRef.current = build;
  });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    buildRef
      .current()
      .then((url) => {
        if (!cancelled) setLoaded({ key, url, failed: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, url: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = key !== null && loaded?.key === key ? loaded : null;
  return {
    url: current && !current.failed ? current.url : null,
    fail: () => {
      if (key !== null) setLoaded({ key, url: null, failed: true });
    },
  };
}
