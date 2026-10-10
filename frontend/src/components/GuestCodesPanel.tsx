import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useScrollLock } from '../hooks/useScrollLock';
import { ApiError, apiClient } from '../lib/apiClient';
import { describeDevice, formatDate, formatDateTime } from '../lib/format';
import { downloadGuestCodeCard, guestCodeLink, prettyGuestCode } from '../lib/guestCodeCard';
import type { GuestCode, GuestCodeSignin, GuestCodesSnapshot } from '../types/api';
import { useToast } from './ToastProvider';

const GUEST_CODES_KEY = ['guest-codes'];
/** Pending requests show up without a reload while the page is open. */
const REFETCH_MS = 15_000;

function platformLabel(platform: GuestCodeSignin['platform']): string {
  return platform === 'android' ? 'Android' : platform === 'web' ? 'Web' : 'Unknown app';
}

/**
 * The admin "Guest access" card: requests from the guest screen (A67), codes shared as text or a QR card, the guests
 * those codes belong to with their sign-in log (A69), and the require-a-code switch (A43).
 */
export function GuestCodesPanel() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [revoking, setRevoking] = useState<GuestCode | null>(null);

  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback, 'error');

  const { data, isLoading, isError } = useQuery({
    queryKey: GUEST_CODES_KEY,
    queryFn: () => apiClient.get<GuestCodesSnapshot>('/guest-codes'),
    refetchInterval: REFETCH_MS,
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
    onSuccess: () => {
      setRevoking(null);
      return queryClient.invalidateQueries({ queryKey: GUEST_CODES_KEY });
    },
    onError: (err) => fail(err, 'Could not revoke that code'),
  });

  const answerMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'deny' }) =>
      apiClient.post<GuestCodesSnapshot>(`/guest-codes/requests/${id}/${action}`),
    onSuccess: (snapshot, { action }) => {
      queryClient.setQueryData(GUEST_CODES_KEY, snapshot);
      showToast(action === 'approve' ? 'Approved. Their device signs in by itself.' : 'Request turned down');
    },
    onError: (err) => {
      fail(err, 'Could not answer that request');
      void queryClient.invalidateQueries({ queryKey: GUEST_CODES_KEY });
    },
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
        : 'Anyone who can open this site can enter as a guest. A code is only needed to be the same guest on another device.';

  const active = data?.codes.filter((c) => c.status === 'active') ?? [];
  const inUse = data?.codes.filter((c) => c.status === 'used') ?? [];
  const expired = data?.codes.filter((c) => c.status === 'expired') ?? [];
  const requests = data?.requests ?? [];

  return (
    <section className="card flex flex-col gap-5 p-4" aria-labelledby="guest-access-heading">
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
      {isError && <p className="text-sm text-red-300">Could not load guest codes. Reload the page to try again.</p>}

      {data && (
        <>
          {/* Waiting people first: they are looking at a "waiting" screen until this is answered. */}
          {requests.length > 0 && (
            <div className="rounded-md border border-orange-600 p-3" aria-labelledby="guest-requests-heading">
              <h3 id="guest-requests-heading" className="text-sm font-semibold text-white">
                Asking for a code ({requests.length})
              </h3>
              <ul className="mt-1 divide-y divide-blue-800/60">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{r.name ?? 'No name given'}</p>
                      <p className="text-xs text-blue-300">
                        {platformLabel(r.platform)} · {formatDateTime(r.createdAt)}
                        {r.ip && ` · ${r.ip}`}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => answerMutation.mutate({ id: r.id, action: 'approve' })}
                        disabled={answerMutation.isPending}
                        className="btn-primary btn-sm"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => answerMutation.mutate({ id: r.id, action: 'deny' })}
                        disabled={answerMutation.isPending}
                        className="btn-ghost btn-sm"
                      >
                        Turn down
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="btn-primary btn-md"
              >
                {createMutation.isPending ? 'Making…' : 'New guest code'}
              </button>
              <p className="text-xs text-blue-300">
                The first person to use a code becomes its guest, on any device. Unused codes stop working after 7
                days.
              </p>
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
                      <p className="text-xs text-blue-300">Unused. Expires {formatDate(c.expiresAt)}.</p>
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
          </div>

          {inUse.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white">Guests with a code ({inUse.length})</h3>
              <ul className="mt-1 divide-y divide-blue-800/60">
                {inUse.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {c.usedByName ?? c.usedBy}
                          {/* The guest's own login name, so one calling itself "imran" can't pass as that account. */}
                          {c.usedByName && c.usedBy && c.usedByName !== c.usedBy && (
                            <span className="ml-1.5 font-mono text-xs font-normal text-blue-400">{c.usedBy}</span>
                          )}
                        </p>
                        <p className="text-xs text-blue-300">
                          <span className="font-mono select-all">{prettyGuestCode(c.code)}</span>
                          {' · '}
                          {c.signins.length === 0
                            ? `First used ${formatDate(c.usedAt ?? c.createdAt)}`
                            : `Last sign-in ${formatDateTime(c.signins[0].at)}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => copy(prettyGuestCode(c.code), 'Code')} className="btn-ghost btn-sm">
                          Copy code
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevoking(c)}
                          disabled={revokeMutation.isPending}
                          className="btn-ghost btn-sm text-red-300!"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>

                    {c.signins.length > 0 && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-xs text-blue-300">
                          {c.signins.length === 1 ? '1 sign-in' : `${c.signins.length} sign-ins`}
                          {c.signins.length === 20 && ' (newest 20)'}
                        </summary>
                        <ul className="mt-1.5 flex flex-col gap-1 text-xs text-blue-200">
                          {c.signins.map((s, i) => (
                            <li key={i} className="flex flex-wrap gap-x-3">
                              <span className="text-blue-300">{formatDateTime(s.at)}</span>
                              <span>{platformLabel(s.platform)}</span>
                              <span title={s.userAgent ?? undefined}>{describeDevice(s.userAgent)}</span>
                              {s.ip && <span className="text-blue-300">{s.ip}</span>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {expired.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-blue-300">Expired (last 30 days)</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {expired.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 text-xs text-blue-300">
                    <span className="font-mono">{prettyGuestCode(c.code)}</span>
                    <span>
                      {c.usedAt ? `Guest gone since ${formatDate(c.usedAt)}` : `Expired ${formatDate(c.expiresAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {revoking && (
        <RevokeGuestDialog
          code={revoking}
          isRevoking={revokeMutation.isPending}
          onConfirm={() => revokeMutation.mutate(revoking.id)}
          onCancel={() => setRevoking(null)}
        />
      )}
    </section>
  );
}

/** Revoking a used code deletes its guest, so it gets a confirmation the unused-code Revoke doesn't need. */
function RevokeGuestDialog({
  code,
  isRevoking,
  onConfirm,
  onCancel,
}: {
  code: GuestCode;
  isRevoking: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useScrollLock();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const name = code.usedByName ?? code.usedBy ?? 'this guest';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="revoke-guest-heading"
        className="card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="revoke-guest-heading" className="text-sm font-semibold text-white">
          Revoke {name}'s code?
        </h2>
        <p className="mt-2 text-sm text-blue-200">
          This deletes the guest and their listening history. Every device using the code is signed out, and the code
          stops working.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} autoFocus className="btn-secondary btn-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isRevoking} className="btn-danger btn-sm">
            {isRevoking ? 'Revoking…' : 'Revoke and delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
