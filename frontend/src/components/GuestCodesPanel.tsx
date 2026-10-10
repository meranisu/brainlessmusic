import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatDate } from '../lib/format';
import { downloadGuestCodeCard, guestCodeLink, prettyGuestCode } from '../lib/guestCodeCard';
import type { GuestCode, GuestCodesSnapshot } from '../types/api';
import { useToast } from './ToastProvider';

const GUEST_CODES_KEY = ['guest-codes'];

/** The admin "Guest access" card (A42/A43): one-use codes shared as text or a QR card, and the require-a-code switch. */
export function GuestCodesPanel() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback, 'error');

  const { data, isLoading, isError } = useQuery({
    queryKey: GUEST_CODES_KEY,
    queryFn: () => apiClient.get<GuestCodesSnapshot>('/guest-codes'),
  });

  const requiredMutation = useMutation({
    mutationFn: (required: boolean) => apiClient.put<GuestCodesSnapshot>('/guest-codes/settings', { required }),
    // The box flips on click; a refused save puts it back.
    onMutate: (required) => {
      const previous = queryClient.getQueryData<GuestCodesSnapshot>(GUEST_CODES_KEY);
      if (previous) queryClient.setQueryData(GUEST_CODES_KEY, { ...previous, required });
      return { previous };
    },
    onSuccess: (snapshot) => queryClient.setQueryData(GUEST_CODES_KEY, snapshot),
    onError: (err, _required, context) => {
      if (context?.previous) queryClient.setQueryData(GUEST_CODES_KEY, context.previous);
      fail(err, 'Could not change that setting');
    },
  });

  const createMutation = useMutation({
    mutationFn: () => apiClient.post<GuestCode>('/guest-codes'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GUEST_CODES_KEY }),
    onError: (err) => fail(err, 'Could not make a code'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/guest-codes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GUEST_CODES_KEY }),
    onError: (err) => fail(err, 'Could not revoke that code'),
  });

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copied`);
    } catch {
      // Clipboard access needs HTTPS; on the plain-HTTP LAN it is refused.
      // The code stays on screen to select by hand.
      showToast('Copying is blocked here. Select the code and copy it by hand.', 'error');
    }
  }

  async function download(code: GuestCode) {
    try {
      await downloadGuestCodeCard(code.code, formatDate(code.expiresAt));
    } catch {
      showToast('Could not make the image', 'error');
    }
  }

  const doorState = !data
    ? null
    : data.required
      ? 'Guests need a code to get in.'
      : data.sharedCodeSet
        ? 'Guests need the shared code from the server settings (ENTRY_CODE), or one of these.'
        : 'Anyone who can open this site can enter as a guest. Codes are not checked.';

  const active = data?.codes.filter((c) => c.status === 'active') ?? [];
  const past = data?.codes.filter((c) => c.status !== 'active') ?? [];

  return (
    <section className="card flex flex-col gap-4 p-4" aria-labelledby="guest-access-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="guest-access-heading" className="text-sm font-semibold text-white">
            Guest access
          </h2>
          {doorState && <p className="mt-1 text-xs text-blue-300">{doorState}</p>}
        </div>
        {data && (
          <label className="flex shrink-0 items-center gap-2 text-sm text-blue-200">
            <input
              type="checkbox"
              checked={data.required}
              disabled={requiredMutation.isPending}
              onChange={(e) => requiredMutation.mutate(e.target.checked)}
              className="accent-orange-600"
            />
            Ask guests for a code
          </label>
        )}
      </div>

      {isLoading && <p className="text-sm text-blue-300">Loading codes…</p>}
      {isError && <p className="text-sm text-red-300">Could not load guest codes.</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="btn-primary btn-md"
            >
              {createMutation.isPending ? 'Making…' : 'New guest code'}
            </button>
            <p className="text-xs text-blue-400">Each code lets one device in, and stops working after 7 days unused.</p>
          </div>

          {active.length === 0 ? (
            <p className="text-sm text-blue-300">No unused codes. Make one when someone needs to get in.</p>
          ) : (
            <ul className="divide-y divide-blue-800/60">
              {active.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-semibold tracking-wider text-white select-all">
                      {prettyGuestCode(c.code)}
                    </p>
                    <p className="text-xs text-blue-400">Unused. Expires {formatDate(c.expiresAt)}.</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => copy(prettyGuestCode(c.code), 'Code')} className="btn-ghost btn-sm">
                      Copy code
                    </button>
                    <button type="button" onClick={() => copy(guestCodeLink(c.code), 'Link')} className="btn-ghost btn-sm">
                      Copy link
                    </button>
                    <button type="button" onClick={() => download(c)} className="btn-ghost btn-sm">
                      Download image
                    </button>
                    <button
                      type="button"
                      onClick={() => revokeMutation.mutate(c.id)}
                      disabled={revokeMutation.isPending}
                      className="btn-ghost btn-sm text-red-300!"
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-blue-400">Used and expired (last 30 days)</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {past.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 text-xs text-blue-300">
                    <span className="font-mono">{prettyGuestCode(c.code)}</span>
                    <span>
                      {c.status === 'used'
                        ? `Used${c.usedBy ? ` by ${c.usedBy}` : ''} on ${formatDate(c.usedAt ?? c.createdAt)}`
                        : `Expired ${formatDate(c.expiresAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
