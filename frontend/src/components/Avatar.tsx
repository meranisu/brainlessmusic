import { useEffect, useState } from 'react';
import { buildAvatarUrl } from '../lib/apiClient';

const SIZES = {
  sm: 'h-9 w-9 text-base',
  md: 'h-12 w-12 text-xl',
  lg: 'h-24 w-24 text-4xl sm:h-28 sm:w-28',
} as const;

/** A person's picture, or their initial in a tile when they have none (the same tile the Users roster shows). */
export function Avatar({
  userId,
  name,
  avatarId,
  size = 'sm',
}: {
  userId: number;
  name: string;
  avatarId: string | null;
  size?: keyof typeof SIZES;
}) {
  const [url, setUrl] = useState<{ key: string; src: string } | null>(null);
  const key = avatarId ? `${userId}:${avatarId}` : null;

  useEffect(() => {
    if (!avatarId) return;
    let cancelled = false;
    buildAvatarUrl(userId, avatarId)
      .then((src) => {
        if (!cancelled) setUrl({ key: `${userId}:${avatarId}`, src });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, avatarId]);

  const box = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-blue-700 ${SIZES[size]}`;
  if (key && url?.key === key) {
    return <img src={url.src} alt="" className={`${box} object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${box} bg-blue-800 font-display font-extrabold text-white`}>
      {Array.from(name.trim())[0]?.toUpperCase() ?? '?'}
    </span>
  );
}
