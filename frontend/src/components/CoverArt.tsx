import { useState } from 'react';
import { useMediaUrl } from '../hooks/useMediaUrl';
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
export function CoverArt({
  kind,
  id,
  size = 'thumb',
  className = 'h-10 w-10',
  alt = '',
  bare = false,
}: CoverArtProps) {
  const { url, fail } = useMediaUrl(`${kind}:${id}:${size}`, () => buildCoverUrl(kind, id, size));
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const shared = bare
    ? `${className} shrink-0 object-cover`
    : `${className} shrink-0 rounded-md border border-blue-800 object-cover`;

  if (!url) {
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
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${shared} bg-blue-950 transition-opacity duration-300 ${loadedUrl === url ? 'opacity-100' : 'opacity-0'}`}
      onLoad={() => setLoadedUrl(url)}
      onError={fail}
    />
  );
}
