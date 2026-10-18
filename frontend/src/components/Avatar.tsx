import { useMediaUrl } from '../hooks/useMediaUrl';
import { buildAvatarUrl } from '../lib/apiClient';

const SIZES = {
  xs: 'h-8 w-8 text-sm',
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
  const { url } = useMediaUrl(avatarId ? `${userId}:${avatarId}` : null, () => buildAvatarUrl(userId, avatarId ?? ''));

  const box = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-blue-700 ${SIZES[size]}`;
  if (url) {
    return <img src={url} alt="" className={`${box} object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${box} bg-blue-800 font-display font-extrabold text-white`}>
      {Array.from(name.trim())[0]?.toUpperCase() ?? '?'}
    </span>
  );
}
