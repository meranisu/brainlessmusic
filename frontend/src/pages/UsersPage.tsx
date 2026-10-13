import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext';
import {
  DoorSwitch,
  ExpiredCodes,
  GuestCodeCreatedDialog,
  UnusedCodes,
  WaitingRequests,
} from '../components/GuestAccess';
import { InviteLinkDialog, OpenInvites, type CreatedInvite } from '../components/Invites';
import { PersonPanel, PersonTile } from '../components/PersonPanel';
import { useToast } from '../components/ToastProvider';
import { deviceCount, useGuestCodeActions, useGuestCodes } from '../hooks/useGuestCodes';
import { useScrollLock } from '../hooks/useScrollLock';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatDate, formatSince } from '../lib/format';
import { prettyGuestCode } from '../lib/guestCodeCard';
import { createInvite, INVITES_KEY } from '../lib/invites';
import { roleLabel } from '../lib/people';
import type { GuestCode, UserSummary } from '../types/api';

/**
 * The Users tab, roster first (A159): requests waiting at the top, everyone in one list, and the ways in at the
 * bottom. A person's actions open in their panel (A160); a row shows last seen, plays, date added, and a guest's code
 * and devices (A161).
 */

const MIN_PASSWORD_LENGTH = 8;
const USERS_KEY = ['users'];

type Filter = 'all' | 'admins' | 'listeners' | 'guests';

const FILTERS: { id: Filter; label: string; test: (u: UserSummary) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'admins', label: 'Admins', test: (u) => u.kind === 'account' && u.isAdmin },
  { id: 'listeners', label: 'Listeners', test: (u) => u.kind === 'account' && !u.isAdmin },
  { id: 'guests', label: 'Guests', test: (u) => u.kind === 'guest' },
];

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null);
  const [createdCode, setCreatedCode] = useState<GuestCode | null>(null);

  const users = useQuery({
    queryKey: USERS_KEY,
    queryFn: () => apiClient.get<{ users: UserSummary[] }>('/users'),
  });
  const guestCodes = useGuestCodes();

  const people = users.data?.users ?? [];
  const accounts = people.filter((u) => u.kind === 'account').length;
  const guests = people.length - accounts;
  const shown = people.filter(FILTERS.find((f) => f.id === filter)!.test);
  // Guests are matched to their code by login name, which the codes list carries as `usedBy`.
  const codeOf = (person: UserSummary): GuestCode | null =>
    person.kind === 'guest'
      ? (guestCodes.data?.codes.find((c) => c.status === 'used' && c.usedBy === person.username) ?? null)
      : null;
  const open = openId === null ? undefined : people.find((u) => u.id === openId);
  // "Seen 2 h ago" is measured from when the list arrived, so a render can't move it.
  const now = users.dataUpdatedAt;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-white">Users</h2>
        <p className="text-sm text-blue-300">
          {users.data
            ? `${accounts} ${accounts === 1 ? 'account' : 'accounts'}, ${guests} ${guests === 1 ? 'guest' : 'guests'}`
            : 'Loading…'}
        </p>
      </div>

      <WaitingRequests />

      <section aria-labelledby="roster-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="roster-heading" className="sr-only">
            Everyone
          </h3>
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => {
              const count = people.filter(f.test).length;
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'border-orange-600 bg-blue-800 text-white'
                      : 'border-blue-700 text-blue-300 hover:border-blue-500 hover:text-white'
                  }`}
                >
                  {f.label} <span className="tabular-nums text-blue-400">{count}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setAdding(true)} className="btn-primary btn-md">
            Add someone
          </button>
        </div>

        {users.isLoading && <p className="card px-4 py-6 text-center text-sm text-blue-300">Loading people…</p>}
        {users.isError && (
          <p className="card px-4 py-6 text-center text-sm text-red-300">
            Couldn't load the list of people. Reload the page to try again.
          </p>
        )}

        {users.data && (
          <div className="card overflow-hidden">
            {/* Column names for wide screens; on a phone each row stacks and says what it is. */}
            <div className="hidden grid-cols-[minmax(0,2fr)_6rem_8rem_6rem_7rem] gap-3 border-b border-blue-800 px-4 py-2.5 text-xs uppercase tracking-wide text-blue-400 md:grid">
              <span>Name</span>
              <span>Role</span>
              <span>Last seen</span>
              <span className="text-right">Plays, 7d</span>
              <span className="text-right">Added</span>
            </div>
            {shown.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-blue-300">
                {filter === 'guests'
                  ? 'No guests. Make a guest code from "Add someone" to let someone in without an account.'
                  : 'Nobody here yet. Use "Add someone" to invite a friend.'}
              </p>
            ) : (
              <ul className="divide-y divide-blue-800/60">
                {shown.map((u) => (
                  <li key={u.id}>
                    <RosterRow
                      person={u}
                      code={codeOf(u)}
                      isSelf={u.id === currentUser?.id}
                      now={now}
                      onOpen={() => setOpenId(u.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="ways-in-heading" className="card flex flex-col gap-5 p-4">
        <div>
          <h3 id="ways-in-heading" className="text-sm font-semibold text-white">
            Ways in
          </h3>
          <p className="mt-0.5 text-xs text-blue-300">
            How new people get in, and the links and codes still waiting to be used.
          </p>
        </div>
        {guestCodes.isError && (
          <p className="text-sm text-red-300">Couldn't load guest codes. Reload the page to try again.</p>
        )}
        <DoorSwitch />
        <div className="border-t border-blue-800 pt-4">
          <OpenInvites />
        </div>
        <div className="border-t border-blue-800 pt-4">
          <UnusedCodes />
        </div>
        <ExpiredCodes />
      </section>

      {open && (
        <PersonPanel
          person={open}
          code={codeOf(open)}
          isSelf={open.id === currentUser?.id}
          now={now}
          onClose={() => setOpenId(null)}
          onInvite={setCreatedInvite}
        />
      )}

      {adding && (
        <AddSomeoneDialog
          onClose={() => setAdding(false)}
          onInvite={(invite) => {
            setAdding(false);
            setCreatedInvite(invite);
          }}
          onCode={(code) => {
            setAdding(false);
            setCreatedCode(code);
          }}
        />
      )}

      {createdInvite && <InviteLinkDialog invite={createdInvite} onClose={() => setCreatedInvite(null)} />}
      {createdCode && <GuestCodeCreatedDialog code={createdCode} onClose={() => setCreatedCode(null)} />}
    </div>
  );
}

function RosterRow({
  person,
  code,
  isSelf,
  now,
  onOpen,
}: {
  person: UserSummary;
  code: GuestCode | null;
  isSelf: boolean;
  now: number;
  onOpen: () => void;
}) {
  const seen = person.lastSeenAt ? formatSince(person.lastSeenAt, now) : 'never';
  const devices = code ? deviceCount(code) : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${person.displayName}, ${roleLabel(person)}. Open details`}
      className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-blue-800/50 focus-visible:bg-blue-800/50 md:grid-cols-[minmax(0,2fr)_6rem_8rem_6rem_7rem]"
    >
      <span className="flex min-w-0 items-center gap-3 max-md:contents">
        <PersonTile person={person} />
        <span className="min-w-0">
          <span className="block truncate font-medium text-white">
            {person.displayName}
            {isSelf && <span className="ml-2 text-xs font-normal text-blue-400">you</span>}
          </span>
          <span className="block truncate text-xs text-blue-300">
            {person.displayName !== person.username && <span className="mr-2 font-mono">{person.username}</span>}
            {code && (
              <span>
                code <span className="font-mono">{prettyGuestCode(code.code)}</span>, {devices}{' '}
                {devices === 1 ? 'device' : 'devices'}
              </span>
            )}
            {/* On a phone the other columns fold into this line. */}
            <span className="md:hidden">
              {(person.displayName !== person.username || code) && ' · '}
              {roleLabel(person)} · seen {seen} · {person.plays7d} {person.plays7d === 1 ? 'play' : 'plays'} this week
            </span>
          </span>
        </span>
      </span>
      <span className="hidden md:block">
        {person.isAdmin ? (
          <span className="badge-admin">Admin</span>
        ) : (
          <span className="text-sm text-blue-300">{roleLabel(person)}</span>
        )}
      </span>
      <span className="hidden text-sm text-blue-200 md:block">{seen}</span>
      <span className="hidden text-right text-sm tabular-nums text-blue-200 md:block">{person.plays7d}</span>
      <span className="hidden text-right text-sm text-blue-300 md:block">{formatDate(person.createdAt)}</span>
    </button>
  );
}

type AddMode = 'choose' | 'create';

/** One door for the three ways to add someone (A159): invite link, guest code, or making the account yourself. */
function AddSomeoneDialog({
  onClose,
  onInvite,
  onCode,
}: {
  onClose: () => void;
  onInvite: (invite: CreatedInvite) => void;
  onCode: (code: GuestCode) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { create: createCode } = useGuestCodeActions();
  const [mode, setMode] = useState<AddMode>('choose');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);

  useScrollLock();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback, 'error');

  const inviteMutation = useMutation({
    mutationFn: () => createInvite(),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: INVITES_KEY });
      onInvite({ ...created, guestName: null });
    },
    onError: (err) => fail(err, 'Could not make an invite link'),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Created through /auth/register, the one place that makes users.
      const created = await apiClient.post<UserSummary>('/auth/register', { username: username.trim(), password });
      if (makeAdmin) await apiClient.patch(`/users/${created.id}`, { isAdmin: true });
      return created;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
      showToast(`Created “${created.username}”`);
      onClose();
    },
    onError: (err) => fail(err, 'Could not create that account'),
  });

  const choices: { title: string; text: string; action: () => void; busy: boolean; recommended?: boolean }[] = [
    {
      title: 'Invite link',
      text: 'They pick their own name and password, on the web or the Android app. One use, valid 7 days.',
      action: () => inviteMutation.mutate(),
      busy: inviteMutation.isPending,
      recommended: true,
    },
    {
      title: 'Guest code',
      text: 'Listen without an account. The first person to use it becomes its guest, on any device.',
      action: () => createCode.mutate(undefined, { onSuccess: (code) => onCode(code) }),
      busy: createCode.isPending,
    },
    {
      title: 'Make the account yourself',
      text: 'You choose the name and password and tell them. For someone who will not set it up alone.',
      action: () => setMode('create'),
      busy: false,
    },
  ];

  // Into <body>: inside the page it would sit under the sticky header, which is drawn above the page.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-someone-heading"
        className="card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="add-someone-heading" className="text-sm font-semibold text-white">
          {mode === 'choose' ? 'Add someone' : 'Make an account'}
        </h2>

        {mode === 'choose' ? (
          <>
            <ul className="mt-3 flex flex-col gap-2">
              {choices.map((c) => (
                <li key={c.title}>
                  <button
                    type="button"
                    onClick={c.action}
                    disabled={c.busy}
                    className="w-full rounded-md border border-blue-700 px-4 py-3 text-left transition-colors hover:border-orange-600 focus-visible:border-orange-600 disabled:opacity-60"
                  >
                    <span className="block text-sm font-medium text-white">
                      {c.busy ? 'Making…' : c.title}
                      {c.recommended && <span className="ml-2 text-xs font-normal text-accent-ink">usual</span>}
                    </span>
                    <span className="mt-0.5 block text-xs text-blue-300">{c.text}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={onClose} className="btn-secondary btn-sm">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!username.trim()) return;
              if (password.length < MIN_PASSWORD_LENGTH) {
                showToast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'error');
                return;
              }
              createMutation.mutate();
            }}
            className="mt-3 flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1 text-sm text-blue-200">
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                autoFocus
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-blue-200">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`${MIN_PASSWORD_LENGTH}+ characters`}
                autoComplete="new-password"
                className="input"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-blue-200">
              <input
                type="checkbox"
                checked={makeAdmin}
                onChange={(e) => setMakeAdmin(e.target.checked)}
                className="accent-orange-600"
              />
              Admin: can upload, edit tags, delete tracks and manage people
            </label>
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" onClick={() => setMode('choose')} className="btn-secondary btn-sm">
                Back
              </button>
              <button
                type="submit"
                disabled={!username.trim() || !password || createMutation.isPending}
                className="btn-primary btn-sm"
              >
                {createMutation.isPending ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
