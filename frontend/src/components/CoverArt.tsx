import { useEffect, useState } from 'react';
import { buildCoverUrl } from '../lib/apiClient';

interface CoverArtProps {
  kind: 'tracks' | 'albums';
  id: number;
  size?: 'thumb' | 'full';
  /** Tailwind sizing classes for the box — the placeholder matches them. */
  className?: string;
  alt?: string;
  /** Skips the default rounded-corner-and-border treatment so `className` can
   *  fully own the shape — for a decorative use (a full-bleed blurred
   *  background, say) where a hard-edged border would show through the blur. */
  bare?: boolean;
}

/**
 * Cover image with a placeholder that occupies the same box, so a list of rows
 * doesn't reflow as covers arrive or turn out to be missing. A track with no
 * embedded art 404s, which is expected rather than an error — the placeholder
 * is the answer, not a broken-image icon.
 */
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

  // Identifies which cover the loaded state belongs to. Comparing it during
  // render is what lets the effect avoid a synchronous reset on every prop
  // change — a stale result simply doesn't match and shows the placeholder.
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
