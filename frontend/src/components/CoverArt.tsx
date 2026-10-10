import { useEffect, useState } from 'react';
import { buildCoverUrl } from '../lib/apiClient';

interface CoverArtProps {
  kind: 'tracks' | 'albums';
  id: number;
  size?: 'thumb' | 'full';
  /** Tailwind sizing for the box; the placeholder matches it. */
  className?: string;
  alt?: string;
  /** Drops the rounded border so `className` owns the shape, e.g. a blurred full-bleed background. */
  bare?: boolean;
}

/** Cover with a same-size placeholder, so rows don't reflow. A 404 means no embedded art, not an error. */
interface Loaded {
  key: string;
  url: string | null;
  failed: boolean;
}

export function CoverArt({
  kind,
  id,
  size = 'thumb',
  className = 'h-10 w-10',
  alt = '',
  bare = false,
}: CoverArtProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Ties the loaded state to one cover, so a stale result just shows the placeholder without a reset effect.
  const key = `${kind}:${id}:${size}`;

  useEffect(() => {
    let cancelled = false;

    buildCoverUrl(kind, id, size)
      .then((url) => {
        if (!cancelled) setLoaded({ key: `${kind}:${id}:${size}`, url, failed: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: `${kind}:${id}:${size}`, url: null, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [kind, id, size]);

  const current = loaded?.key === key ? loaded : null;
  const shared = bare
    ? `${className} shrink-0 object-cover`
    : `${className} shrink-0 rounded-md border border-blue-800 object-cover`;

  if (!current || current.failed || !current.url) {
    return (
      <div
        className={`${shared} flex items-center justify-center bg-blue-950 text-blue-700`}
        aria-hidden
        data-testid="cover-placeholder"
      >
        {/* A record, drawn rather than an emoji so it inherits the theme. */}
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={current.url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${shared} bg-blue-950`}
      onError={() => setLoaded({ key, url: null, failed: true })}
    />
  );
}
