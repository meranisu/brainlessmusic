import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastProvider';
import { ApiError, apiClient } from '../lib/apiClient';
import { createInvite, INVITES_KEY } from '../lib/invites';
import { formatDate } from '../lib/format';
import type { AccountInvite } from '../types/api';

export interface CreatedInvite {
  url: string;
  expiresAt: string;
  /** Set when the link turns a guest into an account. */
  guestName: string | null;
}

/** "Invite someone" on the Users page, and the invites still open. A link is shown once, when made. */
export function InvitesPanel({ onCreated }: { onCreated: (invite: CreatedInvite) => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data } = useQuery({
    queryKey: INVITES_KEY,
    queryFn: () => apiClient.get<{ invites: AccountInvite[] }>('/admin/invites'),
  });

  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback, 'error');

  const createMutation = useMutation({
    mutationFn: () => createInvite(),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: INVITES_KEY });
      onCreated({ ...created, guestName: null });
    },
    onError: (err) => fail(err, 'Could not make an invite link'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/admin/invites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVITES_KEY });
      showToast('Invite revoked');
    },
    onError: (err) => fail(err, 'Could not revoke that invite'),
  });

  const open = data?.invites.filter((invite) => invite.status === 'open') ?? [];

  return (
    <section className="card flex flex-col gap-3 p-4" aria-labelledby="invites-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="invites-heading" className="text-sm font-semibold text-white">
          Invite someone
        </h3>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="btn-primary btn-md shrink-0"
        >
          {createMutation.isPending ? 'Making…' : 'Make invite link'}
        </button>
      </div>
      <p className="text-xs text-blue-400">
        Send the link to a friend. They pick their own name and password, then sign in on the web or the Android app.
        One use, valid 7 days.
      </p>

      {open.length > 0 && (
        <ul className="divide-y divide-blue-800/60 text-sm">
          {open.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-blue-200">
                {invite.guestName ? `Account for guest ${invite.guestName}` : 'New account'}
                <span className="ml-2 text-xs text-blue-400">until {formatDate(invite.expiresAt)}</span>
              </span>
              <button
                onClick={() => revokeMutation.mutate(invite.id)}
                disabled={revokeMutation.isPending}
                className="btn-ghost btn-sm text-red-300!"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Shows a just-made link with Copy. Closing it loses the link for good; the invite stays open until used. */
export function InviteLinkDialog({ invite, onClose }: { invite: CreatedInvite; onClose: () => void }) {
  const { showToast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.url);
      showToast('Link copied');
    } catch {
      // Clipboard access needs HTTPS; the link stays on screen to select by hand.
      showToast('Copying is blocked here. Select the link and copy it by hand.', 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="invite-link-heading"
        className="card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="invite-link-heading" className="mb-2 text-sm font-semibold text-white">
          {invite.guestName ? `Invite link for ${invite.guestName}` : 'Invite link'}
        </h2>
        <p className="mb-3 text-xs text-blue-400">
          {invite.guestName
            ? 'Opening it turns this guest into an account. Their resume point stays, and their guest code stops working.'
            : 'Anyone with this link can make one account.'}{' '}
          It works once, until {formatDate(invite.expiresAt)}. Copy it now: it isn't shown again.
        </p>
        <input
          readOnly
          value={invite.url}
          aria-label="Invite link"
          onFocus={(e) => e.currentTarget.select()}
          className="input mb-4 w-full font-mono text-xs"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary btn-sm">
            Done
          </button>
          <button onClick={copy} className="btn-primary btn-sm">
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}
