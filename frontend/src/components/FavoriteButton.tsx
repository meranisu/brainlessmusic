import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { apiClient, getToken } from '../lib/apiClient';
import { useToast } from './ToastProvider';

const FAVORITE_IDS_KEY = ['favorites', 'ids'];

/** Favorited ids, one shared query, so a heart toggled anywhere lights up everywhere. */
export function useFavoriteIds() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: FAVORITE_IDS_KEY,
    queryFn: () => apiClient.get<{ trackIds: number[] }>('/me/favorites/ids'),
    staleTime: 30_000,
    // The provider also wraps the login route, where this would 401 and clear the token. Guests get 403 (A37).
    enabled: Boolean(getToken()) && user != null && !user.isGuest,
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  // Counts favouriting clicks, so the pop plays on the click and not for every heart already lit on page load.
  const [popKey, setPopKey] = useState(0);

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

  // Hidden until the user is known, so a guest never sees a heart flash in.
  if (!user || user.isGuest) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!isFavorited) setPopKey((k) => k + 1);
        mutation.mutate(!isFavorited);
      }}
      aria-pressed={isFavorited}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      className={`transition-colors ${
        isFavorited ? 'text-orange-500 hover:text-orange-400' : 'text-blue-400 hover:text-orange-500'
      } relative ${className}`}
    >
      {isFavorited && popKey > 0 && (
        <span key={popKey} aria-hidden className="heart-burst">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <i key={n} style={{ '--a': `${n * 60}deg` } as React.CSSProperties} />
          ))}
        </span>
      )}
      <svg key={isFavorited ? popKey : 'off'} viewBox="0 0 24 24" className={`h-4 w-4 ${isFavorited && popKey > 0 ? 'heart-pop' : ''}`} fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20.3 4.6 12.9a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
