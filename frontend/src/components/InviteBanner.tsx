import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../lib/apiClient';
import type { RoomInvite } from '../types/api';
import { Avatar } from './Avatar';
import { Presence } from './Presence';
import { useRoom } from './RoomProvider';

/** Same pace as friends' now playing; React Query stops it while the tab is hidden. */
const INVITE_POLL_MS = 15_000;

/**
 * A Listen together invite (A255), newest first. Join goes in like a room link; Not now declines it. Accounts only:
 * guests can't be invited.
 */
export function InviteBanner() {
  const { user } = useAuth();
  const { room, join } = useRoom();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invites = useQuery({
    queryKey: ['rooms', 'invites'],
    queryFn: () => apiClient.get<{ invites: RoomInvite[] }>('/rooms/invites'),
    enabled: user != null && !user.isGuest,
    refetchInterval: INVITE_POLL_MS,
  });
  const decline = useMutation({
    mutationFn: (code: string) => apiClient.delete(`/rooms/invites/${code}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['rooms', 'invites'] }),
  });

  const invite = invites.data?.invites.find((i) => i.code !== room?.code && i.code !== decline.variables) ?? null;

  return (
    <Presence value={invite}>
      {(shown) => (
        <section
          role="status"
          aria-labelledby="invite-banner-heading"
          className="motion-pop card fixed inset-x-4 top-4 z-40 mx-auto flex max-w-md flex-col gap-3 border-orange-600 p-4"
        >
          <div className="flex items-center gap-3">
            <Avatar userId={shown.from.id} name={shown.from.name} avatarId={shown.from.avatarId} size="sm" />
            <div className="min-w-0 flex-1">
              <h2 id="invite-banner-heading" className="truncate text-sm font-semibold text-white">
                {shown.from.name} invited you to listen together
              </h2>
              <p className="truncate text-xs text-blue-300">
                {shown.nowPlaying
                  ? `Playing ${shown.nowPlaying.title}${shown.nowPlaying.artist ? ` by ${shown.nowPlaying.artist}` : ''}`
                  : 'Nothing playing yet'}
                {` · ${shown.members.length} ${shown.members.length === 1 ? 'person' : 'people'} in`}
              </p>
            </div>
          </div>
          {room && <p className="text-xs text-blue-300">Joining leaves the room you're in now.</p>}
          <div className="flex gap-2">
            <button
              onClick={() => {
                join(shown.code);
                navigate('/together');
                void queryClient.invalidateQueries({ queryKey: ['rooms', 'invites'] });
              }}
              className="btn-primary btn-md"
            >
              {room ? 'Switch rooms' : 'Join'}
            </button>
            <button onClick={() => decline.mutate(shown.code)} className="btn-ghost btn-md">
              Not now
            </button>
          </div>
        </section>
      )}
    </Presence>
  );
}
