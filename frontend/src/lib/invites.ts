import { apiClient } from './apiClient';

export const INVITES_KEY = ['admin-invites'];

/**
 * Makes an invite (A107-A112). The token is the 8-character code typed at `/signup` (A191); the link carries it too.
 * With `guestUserId`, it turns that guest into an account.
 */
export async function createInvite(guestUserId?: number): Promise<{ url: string; code: string; expiresAt: string }> {
  const { token, expiresAt } = await apiClient.post<{ token: string; expiresAt: string }>(
    '/admin/invites',
    guestUserId === undefined ? {} : { guestUserId },
  );
  return { url: `${window.location.origin}/invite/${token}`, code: token, expiresAt };
}
