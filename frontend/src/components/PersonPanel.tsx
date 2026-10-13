import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../hooks/useScrollLock';
import { deviceCount, platformLabel, useGuestCodeActions } from '../hooks/useGuestCodes';
import { ApiError, apiClient } from '../lib/apiClient';
import { describeDevice, formatDate, formatDateTime, formatSince } from '../lib/format';
import { prettyGuestCode } from '../lib/guestCodeCard';
import { createInvite, INVITES_KEY } from '../lib/invites';
import { roleLabel } from '../lib/people';
import type { GuestCode, UserSummary } from '../types/api';
import { RevokeGuestDialog } from './GuestAccess';
import type { CreatedInvite } from './Invites';
import { useToast } from './ToastProvider';

const MIN_PASSWORD_LENGTH = 8;
const USERS_KEY = ['users'];

/** The roster's initial: a guest's plain, an account's solid, an admin's edged in the accent, as rooms show the host. */
export function PersonTile({ person, size = 'sm' }: { person: UserSummary; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-12 w-12 text-xl' : 'h-9 w-9 text-base';
  const tone =
    person.kind === 'guest'
      ? 'border-blue-700 bg-blue-950 text-blue-200'
      : person.isAdmin
        ? 'border-orange-600 bg-blue-800 text-white'
        : 'border-blue-700 bg-blue-800 text-white';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-md border-2 font-display font-extrabold ${box} ${tone}`}
    >
      {Array.from(person.displayName.trim())[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

/**
 * Everything about one person (A160): facts, role, password, a guest's code and sign-ins, and deleting. Opens from
 * the roster; the roster rows carry no buttons of their own.
 */
export function PersonPanel({
  person,
  code,
  isSelf,
  now,
  onClose,
  onInvite,
}: {
  person: UserSummary;
  /** A guest's code, if they came in with one. */
  code: GuestCode | null;
  isSelf: boolean;
  /** For "seen 2 h ago"; from the page so a render stays pure. */
  now: number;
  onClose: () => void;
  onInvite: (invite: CreatedInvite) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { copy, revoke } = useGuestCodeActions();
  const [settingPassword, setSettingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  useScrollLock();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A confirmation on top closes first.
      if (event.key === 'Escape' && !confirmingDelete && !confirmingRevoke) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirmingDelete, confirmingRevoke]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: USERS_KEY });
  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback, 'error');

  const roleMutation = useMutation({
    mutationFn: (isAdmin: boolean) => apiClient.patch(`/users/${person.id}`, { isAdmin }),
    onSuccess: () => invalidate(),
    onError: (err) => fail(err, 'Could not change that role'),
  });

  const passwordMutation = useMutation({
    mutationFn: (next: string) => apiClient.patch(`/users/${person.id}`, { password: next }),
    onSuccess: () => {
      setSettingPassword(false);
      setPassword('');
      showToast('Password changed');
    },
    onError: (err) => fail(err, 'Could not change that password'),
  });

  const upgradeMutation = useMutation({
    mutationFn: async () => ({ ...(await createInvite(person.id)), guestName: person.displayName }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: INVITES_KEY });
      onInvite(created);
    },
    onError: (err) => fail(err, 'Could not make an invite link'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/users/${person.id}`),
    onSuccess: () => {
      void invalidate();
      showToast(person.kind === 'guest' ? 'Guest deleted' : 'Account deleted');
      onClose();
    },
    onError: (err) => {
      setConfirmingDelete(false);
      fail(err, 'Could not delete that account');
    },
  });

  const facts: { label: string; value: string }[] = [
    { label: 'Added', value: formatDate(person.createdAt) },
    { label: 'Last seen', value: person.lastSeenAt ? formatSince(person.lastSeenAt, now) : 'never' },
    { label: 'Plays, 7 days', value: person.plays7d.toLocaleString() },
  ];

  // Into <body>: inside the page it would sit under the sticky header, which is drawn above the page.
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-heading"
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-blue-700 bg-blue-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-blue-800 p-5">
          <PersonTile person={person} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 id="person-heading" className="truncate text-lg font-semibold text-white">
              {person.displayName}
            </h2>
            <p className="truncate text-xs text-blue-300">
              {/* The login name, so a guest calling itself "imran" can't pass as that account. */}
              <span className="font-mono">{person.username}</span> · {roleLabel(person)}
              {isSelf && ' · you'}
            </p>
          </div>
          <button type="button" onClick={onClose} autoFocus className="btn-secondary btn-sm shrink-0">
            Close
          </button>
        </header>

        <dl className="grid grid-cols-3 gap-3 border-b border-blue-800 p-5">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-xs text-blue-400">{f.label}</dt>
              <dd className="mt-0.5 truncate text-sm text-white tabular-nums">{f.value}</dd>
            </div>
          ))}
        </dl>

        {person.kind === 'account' ? (
          <div className="flex flex-col gap-4 border-b border-blue-800 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-white">{person.isAdmin ? 'Admin' : 'Listener'}</p>
                <p className="text-xs text-blue-300">
                  {person.isAdmin
                    ? 'Can upload, edit tags, delete tracks and manage people.'
                    : 'Can listen, make playlists and join rooms.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => roleMutation.mutate(!person.isAdmin)}
                disabled={roleMutation.isPending}
                className="btn-ghost btn-sm shrink-0"
              >
                {person.isAdmin ? 'Make listener' : 'Make admin'}
              </button>
            </div>

            {settingPassword ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password.length < MIN_PASSWORD_LENGTH) {
                    showToast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'error');
                    return;
                  }
                  passwordMutation.mutate(password);
                }}
                className="flex flex-col gap-2"
              >
                <label htmlFor="person-password" className="text-sm text-white">
                  New password for {person.username}
                </label>
                <input
                  id="person-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`${MIN_PASSWORD_LENGTH}+ characters`}
                  autoComplete="new-password"
                  autoFocus
                  className="input"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setSettingPassword(false)} className="btn-secondary btn-sm">
                    Cancel
                  </button>
                  <button type="submit" disabled={passwordMutation.isPending} className="btn-primary btn-sm">
                    {passwordMutation.isPending ? 'Saving…' : 'Save password'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-blue-300">Forgot theirs? Set a new one and tell them.</p>
                <button type="button" onClick={() => setSettingPassword(true)} className="btn-ghost btn-sm shrink-0">
                  Set password
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 border-b border-blue-800 p-5">
            {code ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-blue-400">Guest code</p>
                  <p className="font-mono text-lg font-semibold tracking-wider text-white select-all">
                    {prettyGuestCode(code.code)}
                  </p>
                  <p className="text-xs text-blue-300">
                    Keeps signing in as this guest until revoked, including on printed cards.
                  </p>
                </div>
                <button type="button" onClick={() => copy(prettyGuestCode(code.code), 'Code')} className="btn-ghost btn-sm">
                  Copy code
                </button>
              </div>
            ) : (
              <p className="text-xs text-blue-300">Came in through the open guest door, without a code.</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-blue-300">
                Turn them into an account: they pick a name and password, and keep their history.
              </p>
              <button
                type="button"
                onClick={() => upgradeMutation.mutate()}
                disabled={upgradeMutation.isPending}
                className="btn-ghost btn-sm shrink-0"
              >
                {upgradeMutation.isPending ? 'Making…' : 'Make an account'}
              </button>
            </div>

            {code && code.signins.length > 0 && (
              <div>
                <p className="text-sm text-white">
                  Sign-ins ({code.signins.length === 20 ? 'newest 20' : code.signins.length}), {deviceCount(code)}{' '}
                  {deviceCount(code) === 1 ? 'device' : 'devices'}
                </p>
                <ul className="mt-1.5 flex flex-col gap-1 text-xs text-blue-200">
                  {code.signins.map((s, i) => (
                    <li key={i} className="flex flex-wrap gap-x-3">
                      <span className="text-blue-300">{formatDateTime(s.at)}</span>
                      <span>{platformLabel(s.platform)}</span>
                      <span title={s.userAgent ?? undefined}>{describeDevice(s.userAgent)}</span>
                      {s.ip && <span className="text-blue-300">{s.ip}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!isSelf && (
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 p-5">
            <p className="text-xs text-blue-400">
              {code
                ? 'Deletes the guest and their history, and the code stops working.'
                : 'Their playlists, favorites and history go with them. The music stays.'}
            </p>
            <button
              type="button"
              onClick={() => (code ? setConfirmingRevoke(true) : setConfirmingDelete(true))}
              className="btn-ghost btn-sm shrink-0 text-red-300!"
            >
              {code ? 'Revoke code and delete' : person.kind === 'guest' ? 'Delete guest' : 'Delete account'}
            </button>
          </div>
        )}
      </aside>

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmingDelete(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-person-heading"
            className="card w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-person-heading" className="mb-2 text-sm font-semibold text-white">
              Delete “{person.displayName}”?
            </h2>
            <p className="mb-4 text-xs text-blue-400">
              Their playlists, favorites and listening history go with them. The music itself stays.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmingDelete(false)} autoFocus className="btn-secondary btn-sm">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="btn-danger btn-sm"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingRevoke && code && (
        <div onClick={(e) => e.stopPropagation()}>
          <RevokeGuestDialog
            code={code}
            isRevoking={revoke.isPending}
            onConfirm={() =>
              revoke.mutate(code.id, {
                onSuccess: () => {
                  showToast('Code revoked and guest deleted');
                  onClose();
                },
              })
            }
            onCancel={() => setConfirmingRevoke(false)}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
