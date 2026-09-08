import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getToken } from '../lib/apiClient';
import { useToast } from './ToastProvider';

const FAVORITE_IDS_KEY = ['favorites', 'ids'];

/**
 * The set of favorited track ids, fetched once and shared by every view that
 * shows a heart. One cache entry keeps the library table, album pages and the
 * player bar in agreement — a heart toggled in one place lights up in all of
 * them, because they read the same query.
 */
export function useFavoriteIds() {
  const { data } = useQuery({
    queryKey: FAVORITE_IDS_KEY,
    queryFn: () => apiClient.get<{ trackIds: number[] }>('/me/favorites/ids'),
    staleTime: 30_000,
    // The player provider wraps the login route too, so without this the
    // query fires unauthenticated on the login screen — a guaranteed 401,
    // and `request()` clears the stored token on any 401.
    enabled: Boolean(getToken()),
  });

  return new Set(data?.trackIds ?? []);
}

interface FavoriteButtonProps {
  trackId: number;
  isFavorited: boolean;
  /** Extra classes for sizing/positioning at the call site. */
  className?: string;
}

export function FavoriteButton({ trackId, isFavorited, className = '' }: FavoriteButtonProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next
        ? apiClient.put<void>(`/tracks/${trackId}/favorite`)
        : apiClient.delete<void>(`/tracks/${trackId}/favorite`),

    // Optimistic: a heart that waits for a round trip feels broken, and the
    // endpoints are idempotent, so replaying one is harmless.
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: FAVORITE_IDS_KEY });
      const previous = queryClient.getQueryData<{ trackIds: number[] }>(FAVORITE_IDS_KEY);

      queryClient.setQueryData<{ trackIds: number[] }>(FAVORITE_IDS_KEY, (old) => {
        const ids = new Set(old?.trackIds ?? []);
        if (next) ids.add(trackId);
        else ids.delete(trackId);
        return { trackIds: [...ids] };
      });

      return { previous };
    },

    onError: (err, _next, context) => {
      if (context?.previous) queryClient.setQueryData(FAVORITE_IDS_KEY, context.previous);
      showToast(err instanceof Error ? err.message : 'Could not update favorite', 'error');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FAVORITE_IDS_KEY });
      queryClient.invalidateQueries({ queryKey: ['favorites', 'list'] });
    },
  });

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        mutation.mutate(!isFavorited);
      }}
      aria-pressed={isFavorited}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      className={`transition-colors ${
        isFavorited ? 'text-orange-500 hover:text-orange-400' : 'text-blue-400 hover:text-orange-500'
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20.3 4.6 12.9a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
