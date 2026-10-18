import { useDialogA11y } from '../hooks/useDialogA11y';
import { useScrollLock } from '../hooks/useScrollLock';
import { platformLabel, useGuestCodeActions, useGuestCodes } from '../hooks/useGuestCodes';
import { formatDate, formatDateTime } from '../lib/format';
import { guestCodeLink, prettyGuestCode } from '../lib/guestCodeCard';
import type { GuestCode } from '../types/api';

/**
 * The guest-code parts of the Users tab (A159), split out of the old "Guest access" card: requests waiting at the top,
 * codes and the require-a-code switch under "Ways in". A guest's own code and sign-ins live in their detail panel.
 */

/** People on the guest screen asking for a code (A67). Shown only while someone waits: they see a waiting screen. */
export function WaitingRequests() {
  const { data } = useGuestCodes();
  const { answer } = useGuestCodeActions();
  const requests = data?.requests ?? [];
  if (requests.length === 0) return null;

  return (
    <section className="card border-orange-600 p-4" aria-labelledby="waiting-heading">
      <h3 id="waiting-heading" className="text-sm font-semibold text-white">
        Waiting for a code ({requests.length})
      </h3>
      <p className="mt-0.5 text-xs text-blue-300">They see a waiting screen until you answer.</p>
      <ul className="mt-2 divide-y divide-blue-800/60">
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
                onClick={() => answer.mutate({ id: r.id, action: 'approve' })}
                disabled={answer.isPending}
                className="btn-primary btn-sm"
              >
                Let in
              </button>
              <button
                type="button"
                onClick={() => answer.mutate({ id: r.id, action: 'deny' })}
                disabled={answer.isPending}
                className="btn-ghost btn-sm"
              >
                Turn down
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the guest door does right now, in words. */
function doorStateText(required: boolean, sharedCodeSet: boolean): string {
  if (required) return 'Guests need a code to get in.';
  if (sharedCodeSet) return 'Guests need the shared code from the server settings (ENTRY_CODE), or a code from here.';
  return 'Anyone who can open this site can enter as a guest. A code is only needed to be the same guest on another device.';
}

/** The require-a-code switch (A43). */
export function DoorSwitch() {
  const { data } = useGuestCodes();
  const { setRequired } = useGuestCodeActions();
  if (!data) return null;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white">Guest door</p>
        <p className="mt-0.5 text-xs text-blue-300">{doorStateText(data.required, data.sharedCodeSet)}</p>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-sm text-blue-200">
        <input
          type="checkbox"
          checked={data.required}
          disabled={setRequired.isPending}
          onChange={(e) => setRequired.mutate(e.target.checked)}
          className="accent-orange-600"
        />
        Ask guests for a code
      </label>
    </div>
  );
}

/** Codes made but not used yet. */
export function UnusedCodes() {
  const { data } = useGuestCodes();
  const { revoke, copy, download } = useGuestCodeActions();
  const active = data?.codes.filter((c) => c.status === 'active') ?? [];

  return (
    <div>
      <p className="text-sm text-white">Unused guest codes ({active.length})</p>
      <p className="mt-0.5 text-xs text-blue-300">
        The first person to use a code becomes its guest, on any device. Unused codes stop working after 7 days.
      </p>
      {active.length > 0 && (
        <ul className="mt-1 divide-y divide-blue-800/60">
          {active.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-base font-semibold tracking-wider text-white select-all">
                  {prettyGuestCode(c.code)}
                </p>
                <p className="text-xs text-blue-300">Expires {formatDate(c.expiresAt)}</p>
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
                  onClick={() => revoke.mutate(c.id)}
                  disabled={revoke.isPending}
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
  );
}

/** Codes that ran out or whose guest is gone, kept 30 days. */
export function ExpiredCodes() {
  const { data } = useGuestCodes();
  const expired = data?.codes.filter((c) => c.status === 'expired') ?? [];
  if (expired.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs text-blue-300">Expired guest codes, last 30 days ({expired.length})</summary>
      <ul className="mt-2 flex flex-col gap-1">
        {expired.map((c) => (
          <li key={c.id} className="flex flex-wrap justify-between gap-2 text-xs text-blue-300">
            <span className="font-mono">{prettyGuestCode(c.code)}</span>
            <span>{c.usedAt ? `Guest gone since ${formatDate(c.usedAt)}` : `Expired ${formatDate(c.expiresAt)}`}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A code just made from "Add someone", with the ways to hand it over. It also stays under "Ways in" until used. */
export function GuestCodeCreatedDialog({ code, onClose }: { code: GuestCode; onClose: () => void }) {
  const { copy, download } = useGuestCodeActions();
  useScrollLock();
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);

  return (
    <div className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="code-made-heading"
        className="motion-pop card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="code-made-heading" className="text-sm font-semibold text-white">
          Guest code
        </h2>
        <p className="mt-3 font-mono text-2xl font-semibold tracking-wider text-white select-all">
          {prettyGuestCode(code.code)}
        </p>
        <p className="mt-2 text-xs text-blue-300">
          Send the code, the link or the image. The first person to use it becomes its guest. Unused, it stops working{' '}
          {formatDate(code.expiresAt)}.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => copy(prettyGuestCode(code.code), 'Code')} className="btn-ghost btn-sm">
            Copy code
          </button>
          <button type="button" onClick={() => copy(guestCodeLink(code.code), 'Link')} className="btn-ghost btn-sm">
            Copy link
          </button>
          <button type="button" onClick={() => download(code)} className="btn-ghost btn-sm">
            Download image
          </button>
          <button type="button" onClick={onClose} autoFocus className="btn-secondary btn-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** Revoking a used code deletes its guest, so it gets a confirmation the unused-code Revoke doesn't need. */
export function RevokeGuestDialog({
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
  const dialogRef = useDialogA11y<HTMLDivElement>(onCancel);

  const name = code.usedByName ?? code.usedBy ?? 'this guest';

  return (
    <div className="motion-scrim fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="revoke-guest-heading"
        className="motion-pop card w-full max-w-sm p-5"
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
