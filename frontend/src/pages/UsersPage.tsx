import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ToastProvider';
import { useScrollLock } from '../hooks/useScrollLock';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatDate } from '../lib/format';
import type { UserSummary } from '../types/api';

const MIN_PASSWORD_LENGTH = 8;
const USERS_KEY = ['users'];

export function UsersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [deletingUser, setDeletingUser] = useState<UserSummary | null>(null);

  useScrollLock(deletingUser !== null);

  const { data, isLoading, isError } = useQuery({
    queryKey: USERS_KEY,
    queryFn: () => apiClient.get<{ users: UserSummary[] }>('/users'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: USERS_KEY });
  const fail = (err: unknown, fallback: string) =>
    showToast(err instanceof ApiError ? err.message : fallback, 'error');

  const createMutation = useMutation({
    mutationFn: async (input: { username: string; password: string; isAdmin: boolean }) => {
      // Creation goes through /auth/register — one code path makes a user, and
      // one place decides who may.
      const created = await apiClient.post<UserSummary>('/auth/register', {
        username: input.username,
        password: input.password,
      });
      if (input.isAdmin) {
        await apiClient.patch(`/users/${created.id}`, { isAdmin: true });
      }
      return created;
    },
    onSuccess: (created) => {
      setNewUsername('');
      setNewPassword('');
      setMakeAdmin(false);
      invalidate();
      showToast(`Created “${created.username}”`);
    },
    onError: (err) => fail(err, 'Could not create that account'),
  });

  const adminMutation = useMutation({
    mutationFn: (input: { id: number; isAdmin: boolean }) =>
      apiClient.patch(`/users/${input.id}`, { isAdmin: input.isAdmin }),
    onSuccess: () => invalidate(),
    onError: (err) => fail(err, 'Could not change that role'),
  });

  const passwordMutation = useMutation({
    mutationFn: (input: { id: number; password: string }) =>
      apiClient.patch(`/users/${input.id}`, { password: input.password }),
    onSuccess: () => {
      setResettingId(null);
      setResetPassword('');
      showToast('Password changed');
    },
    onError: (err) => fail(err, 'Could not change that password'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      setDeletingUser(null);
      invalidate();
      showToast('Account deleted');
    },
    onError: (err) => {
      setDeletingUser(null);
      fail(err, 'Could not delete that account');
    },
  });

  const busy = createMutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Users</h1>
        <p className="text-sm text-blue-300">
          {data ? `${data.users.length} account${data.users.length === 1 ? '' : 's'}` : 'Loading…'}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const username = newUsername.trim();
          if (!username) return;
          if (newPassword.length < MIN_PASSWORD_LENGTH) {
            showToast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'error');
            return;
          }
          createMutation.mutate({ username, password: newPassword, isAdmin: makeAdmin });
        }}
        className="card flex flex-col gap-3 p-4"
      >
        <h2 className="text-sm font-semibold text-white">Add someone</h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Username"
            aria-label="New username"
            autoComplete="off"
            className="input min-w-40 flex-1"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={`Password (${MIN_PASSWORD_LENGTH}+ characters)`}
            aria-label="New password"
            autoComplete="new-password"
            className="input min-w-40 flex-1"
          />
          <label className="flex shrink-0 items-center gap-2 text-sm text-blue-200">
            <input
              type="checkbox"
              checked={makeAdmin}
              onChange={(e) => setMakeAdmin(e.target.checked)}
              className="accent-orange-600"
            />
            Admin
          </label>
          <button
            type="submit"
            disabled={!newUsername.trim() || !newPassword || busy}
            className="btn-primary btn-md shrink-0"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
        <p className="text-xs text-blue-400">
          Admins can upload, edit tags, delete tracks, and manage these accounts. Everyone else can listen.
        </p>
      </form>

      {isLoading && <p className="text-sm text-blue-300">Loading users…</p>}
      {isError && <p className="text-sm text-red-400">Could not load users.</p>}

      {data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-blue-800 text-xs uppercase tracking-wide text-blue-400">
              <tr>
                <th className="py-2.5 pl-4 font-medium">Username</th>
                <th className="py-2.5 font-medium">Role</th>
                <th className="py-2.5 font-medium">Added</th>
                <th className="py-2.5 pr-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-800/60">
              {data.users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="align-top">
                    <td className="py-2.5 pl-4 font-medium text-white">
                      {u.username}
                      {isSelf && <span className="ml-2 text-xs font-normal text-blue-400">you</span>}
                    </td>
                    <td className="py-2.5">
                      {u.isAdmin ? <span className="badge-admin">Admin</span> : <span className="text-blue-300">Listener</span>}
                    </td>
                    <td className="py-2.5 text-blue-300">{formatDate(u.createdAt)}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          onClick={() => adminMutation.mutate({ id: u.id, isAdmin: !u.isAdmin })}
                          disabled={adminMutation.isPending}
                          className="btn-ghost btn-sm"
                        >
                          {u.isAdmin ? 'Make listener' : 'Make admin'}
                        </button>
                        <button
                          onClick={() => {
                            setResettingId(resettingId === u.id ? null : u.id);
                            setResetPassword('');
                          }}
                          className="btn-ghost btn-sm"
                        >
                          Set password
                        </button>
                        {!isSelf && (
                          <button onClick={() => setDeletingUser(u)} className="btn-ghost btn-sm text-red-400!">
                            Delete
                          </button>
                        )}
                      </div>

                      {resettingId === u.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (resetPassword.length < MIN_PASSWORD_LENGTH) {
                              showToast(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'error');
                              return;
                            }
                            passwordMutation.mutate({ id: u.id, password: resetPassword });
                          }}
                          className="mt-2 flex justify-end gap-2"
                        >
                          <input
                            type="password"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            placeholder={`New password for ${u.username}`}
                            aria-label={`New password for ${u.username}`}
                            autoComplete="new-password"
                            autoFocus
                            className="input max-w-56"
                          />
                          <button type="submit" disabled={passwordMutation.isPending} className="btn-primary btn-sm shrink-0">
                            Save
                          </button>
                          <button type="button" onClick={() => setResettingId(null)} className="btn-secondary btn-sm shrink-0">
                            Cancel
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {deletingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeletingUser(null)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-sm font-semibold text-white">Delete “{deletingUser.username}”?</h2>
            <p className="mb-4 text-xs text-blue-400">
              Their playlists, favorites and listening history go with them. The music itself stays.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingUser(null)} className="btn-secondary btn-sm">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deletingUser.id)}
                disabled={deleteMutation.isPending}
                className="btn-danger btn-sm"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
