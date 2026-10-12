import { apiClient } from './apiClient';

export const INVITES_KEY = ['admin-invites'];

/** Makes an invite link (A107-A112). With `guestUserId`, the link turns that guest into an account. */
export async function createInvite(guestUserId?: number): Promise<{ url: string; expiresAt: string }> {
  const { token, expiresAt } = await apiClient.post<{ token: string; expiresAt: string }>(
    '/admin/invites',
    guestUserId === undefined ? {} : { guestUserId },
  );
  return { url: `${window.location.origin}/invite/${token}`, expiresAt };
}
