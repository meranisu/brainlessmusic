import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePlayer } from '../components/PlayerBar';
import { DataSaverIcon } from '../components/icons';
import { useState } from 'react';
import { HandoffDialog } from '../components/HandoffDialog';
import { LibraryBrowseDialog } from '../components/LibraryBrowseDialog';
import { Numpad } from '../components/Numpad';
import { useToast } from '../components/ToastProvider';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatScanStatus } from '../lib/format';
import { applyTheme, loadTheme, THEMES, type ThemeId } from '../lib/theme';
import type { AddLibraryRootResponse, LibraryRoot, LibraryRootListResponse, LibraryRootScanResult } from '../types/api';

interface ToggleRowProps {
  label: string;
  detail: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: () => void;
}

function ToggleRow({ label, detail, icon, checked, onChange }: ToggleRowProps) {
  return (
    <button
      onClick={onChange}
      aria-pressed={checked}
      className="flex w-full items-center gap-4 rounded-lg border border-blue-800 bg-blue-900/60 px-4 py-3.5 text-left transition-colors hover:border-blue-600 hover:bg-blue-800/60"
    >
      <span className={`shrink-0 ${checked ? 'text-orange-500' : 'text-blue-400'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-blue-300">{detail}</span>
      </span>
      {/* A switch, not a tick. This is a setting with two states, and an absent
          checkmark reads as "not loaded yet" rather than as "off". */}
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? 'bg-orange-600' : 'bg-blue-700'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </span>
    </button>
  );
}

const STATUS_STYLES: Record<LibraryRoot['status'], string> = {
  ok: 'text-blue-300',
  unreachable: 'text-red-400',
};

function summarize(result?: LibraryRootScanResult): string | null {
  if (!result?.scan) return null;
  const { filesAdded, filesUpdated, unreadableDirs } = result.scan;
  const parts: string[] = [];
  if (filesAdded > 0) parts.push(`${filesAdded} new`);
  if (filesUpdated > 0) parts.push(`${filesUpdated} updated`);
  if (parts.length === 0) parts.push('No changes found');
  // Not fatal to the scan (a Windows drive's own System Volume Information,
  // say), but worth saying — otherwise a folder that looks emptier than
  // expected reads as a bug rather than a permission this container's user
  // was never going to have.
  if (unreadableDirs > 0) {
    parts.push(`${unreadableDirs} folder${unreadableDirs === 1 ? '' : 's'} couldn't be read`);
  }
  return parts.join(', ');
}

/**
 * Admin-only. Registering a folder here is what lets the scan/missing-file
 * machinery (already built — see `backend/src/services/librarySync.ts`) see
 * it at all; this section is entirely a UI over endpoints that otherwise sit
 * unreachable behind a admin-only gate with nothing calling them.
 *
 * Polls the same way `HealthPage` already polls `/admin/health` — plain
 * `refetchInterval`, no new pattern — so an in-progress scan (this admin's
 * own, or the scheduled one) is reflected here without a manual refresh.
 */
function LibrarySection() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [newPath, setNewPath] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [removeTarget, setRemoveTarget] = useState<LibraryRoot | null>(null);
  const [browsing, setBrowsing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['library-roots'],
    queryFn: () => apiClient.get<LibraryRootListResponse>('/library/roots'),
    refetchInterval: 3000,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['library-roots'] });
    // A newly-found or newly-missing track changes what the arcade select
    // and /manage show — not just this list.
    queryClient.invalidateQueries({ queryKey: ['tracks'] });
  }

  const addRoot = useMutation({
    mutationFn: () =>
      apiClient.post<AddLibraryRootResponse>('/library/roots', {
        path: newPath.trim(),
        label: newLabel.trim() || undefined,
      }),
    onSuccess: (result) => {
      invalidate();
      setNewPath('');
      setNewLabel('');
      showToast(summarize(result) ?? 'Folder added');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not add that folder', 'error'),
  });

  const rescanRoot = useMutation({
    mutationFn: (id: number) => apiClient.post<LibraryRootScanResult>(`/library/roots/${id}/scan`),
    onSuccess: (result) => {
      invalidate();
      showToast(summarize(result) ?? 'Rescanned');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Scan failed', 'error'),
  });

  const removeRoot = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/library/roots/${id}`),
    onSuccess: () => {
      invalidate();
      setRemoveTarget(null);
      showToast('Folder removed — its tracks are kept, flagged missing');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Could not remove that folder', 'error'),
  });

  return (
    <section className="mt-7">
      <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">
        Library folders
      </h2>

      {isLoading && <p className="text-sm text-blue-300">Loading…</p>}

      {data && (
        <div className="space-y-2">
          {data.roots.map((root) => (
            <div
              key={root.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-800 bg-blue-900/60 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{root.label || root.path}</p>
                <p className="truncate text-xs text-blue-400">{root.path}</p>
              </div>
              <span className={`shrink-0 text-xs ${STATUS_STYLES[root.status]}`}>
                {root.scanning
                  ? formatScanStatus(root.scanning, root.scanProgress)
                  : root.status === 'ok'
                    ? `${root.trackCount} tracks`
                    : 'Unreachable'}
              </span>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => rescanRoot.mutate(root.id)}
                  disabled={root.scanning || rescanRoot.isPending}
                  className="btn-ghost btn-sm"
                >
                  Rescan
                </button>
                <button onClick={() => setRemoveTarget(root)} className="btn-ghost btn-sm text-red-400!">
                  Remove
                </button>
              </div>
            </div>
          ))}
          {data.roots.length === 0 && (
            <p className="text-sm text-blue-400">No folders registered yet.</p>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newPath.trim()) addRoot.mutate();
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <input
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          placeholder="/path/inside/the/container"
          className="input min-w-56 flex-1"
        />
        <button type="button" onClick={() => setBrowsing(true)} className="btn-secondary btn-sm">
          Browse…
        </button>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Label (optional)"
          className="input w-40"
        />
        <button type="submit" disabled={!newPath.trim() || addRoot.isPending} className="btn-primary btn-sm">
          {addRoot.isPending ? 'Adding…' : 'Add folder'}
        </button>
      </form>
      <p className="mt-2 text-xs text-blue-400">
        The path is read from inside this server's own container — a drive that isn't already
        mounted into it (see <code className="text-blue-300">docker-compose.yml</code>) won't be
        visible here yet, however real it is on the host.
      </p>

      {browsing && (
        <LibraryBrowseDialog
          initialPath={newPath.trim() || undefined}
          onSelect={(path) => {
            setNewPath(path);
            setBrowsing(false);
          }}
          onCancel={() => setBrowsing(false)}
        />
      )}

      {removeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setRemoveTarget(null)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-sm font-semibold text-white">
              Remove "{removeTarget.label || removeTarget.path}"?
            </h2>
            <p className="mb-4 text-xs text-blue-400">
              Nothing on disk is touched. Its tracks stay in the database — flagged missing, with
              their favorites, playlists and history intact — rather than being deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRemoveTarget(null)} className="btn-secondary btn-sm">
                Cancel
              </button>
              <button
                onClick={() => removeRoot.mutate(removeTarget.id)}
                disabled={removeRoot.isPending}
                className="btn-danger btn-sm"
              >
                {removeRoot.isPending ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The options screen.
 *
 * A page rather than a dropdown, which is the arcade shape: a cabinet's option
 * screen is somewhere you *go*, announced by a plate, not a tray that unrolls
 * from a button. The plate is `ArcadeInterstitial`, played by the shell on the
 * way here.
 *
 * What lives here is what had nowhere better to be. **Data saver** was in the
 * player bar, which only renders while something is playing — so the one
 * control that decides how much of someone's data a track costs was unreachable
 * at exactly the moment anybody would want to set it, before pressing play.
 *
 * Themes live here too, and cost the rest of the app nothing: Tailwind 4
 * compiles `bg-blue-900` to `var(--color-blue-900)`, so a theme is a block of
 * variable overrides and not a single component knows one exists. See
 * `lib/theme.ts`.
 */
export function OptionsPage() {
  const { user, logout, setPasscode, clearPasscode } = useAuth();
  const { dataSaver, setDataSaver } = usePlayer();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [showHandoff, setShowHandoff] = useState(false);
  const [showPasscodeNumpad, setShowPasscodeNumpad] = useState(false);
  const [isClearingPasscode, setIsClearingPasscode] = useState(false);
  /* Initialised from storage rather than an effect, so the selected swatch is
     correct on the first paint instead of flicking to it afterwards. The
     document attribute is already set — the inline script in `index.html` did
     it before React ran — so this is only the component catching up. */
  const [theme, setTheme] = useState<ThemeId>(loadTheme);

  function chooseTheme(id: ThemeId) {
    applyTheme(id);
    setTheme(id);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-semibold uppercase tracking-[0.06em] text-white">
        Options
      </h1>
      <p className="mt-1 text-sm text-blue-300">Settings for this device.</p>

      <section className="mt-7">
        <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">
          Theme
        </h2>
        {/* The swatches are drawn with each theme's own variables via
            `data-swatch`, so they cannot drift from what choosing one actually
            does — a hand-picked preview colour is a second source of truth that
            is wrong the moment a palette is tuned. */}
        {/* A radiogroup, not three toggle buttons. `aria-pressed` says "this
            control is on", which is true of a switch and false of a choice —
            it would announce three independent on/off states for what is one
            mutually exclusive setting, and a screen reader would never say how
            many options there are or which of them this is. */}
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {THEMES.map((option) => (
            <button
              key={option.id}
              role="radio"
              onClick={() => chooseTheme(option.id)}
              aria-checked={theme === option.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                theme === option.id
                  ? 'border-orange-500 bg-orange-600/12'
                  : 'border-blue-800 bg-blue-900/60 hover:border-blue-600 hover:bg-blue-800/60'
              }`}
            >
              <span data-swatch={option.id} className="theme-swatch shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-white">{option.name}</span>
                <span className="block text-xs text-blue-300">{option.detail}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-blue-400">
          Saved on this device. Another device can use a different one.
        </p>
      </section>

      <section className="mt-7">
        <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">
          Playback
        </h2>
        <ToggleRow
          label="Data saver"
          detail="Stream a smaller copy, re-encoded once and kept"
          icon={<DataSaverIcon className="h-5 w-5" />}
          checked={dataSaver}
          onChange={() => void setDataSaver(!dataSaver)}
        />
      </section>

      {user?.isAdmin && <LibrarySection />}

      <section className="mt-7">
        <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">
          This device
        </h2>
        {user?.isGuest ? (
          <div className="rounded-lg border border-blue-800 bg-blue-900/60 p-4">
            <p className="text-sm text-blue-100">
              You are listening as a guest. Nothing identifies you but this browser.
            </p>
            <p className="mt-1 text-xs text-blue-400">
              There is no password to sign back in with, so moving to another device means carrying
              this identity across rather than logging in there.
            </p>
            <button onClick={() => setShowHandoff(true)} className="btn-secondary btn-md mt-3">
              Move or forget this device
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-blue-800 bg-blue-900/60 p-4">
            <p className="text-sm text-blue-100">
              Signed in as <span className="font-medium text-white">{user?.username}</span>
              {user?.isAdmin && <span className="badge-admin ml-2">Admin</span>}
            </p>
            <button onClick={logout} className="btn-secondary btn-md mt-3">
              Log out
            </button>
          </div>
        )}
      </section>

      {/* Passcodes are the arcade-card alternative to a password, from the
          account-select screen — self-service only, so this is the one place
          to create, change or drop one. Guests have no password either, so
          there is nothing here for them to bind a passcode to. */}
      {user && !user.isGuest && (
        <section className="mt-7">
          <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">
            Passcode
          </h2>
          <div className="rounded-lg border border-blue-800 bg-blue-900/60 p-4">
            <p className="text-sm text-blue-100">
              {user.hasPasscode
                ? 'A passcode is set — sign in with it instead of your password.'
                : 'No passcode set. Sign-in still needs your password.'}
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setShowPasscodeNumpad(true)} className="btn-secondary btn-md">
                {user.hasPasscode ? 'Change passcode' : 'Create passcode'}
              </button>
              {user.hasPasscode && (
                <button
                  onClick={async () => {
                    setIsClearingPasscode(true);
                    try {
                      await clearPasscode();
                      showToast('Passcode removed');
                    } catch (err) {
                      showToast(err instanceof ApiError ? err.message : 'Could not remove the passcode', 'error');
                    } finally {
                      setIsClearingPasscode(false);
                    }
                  }}
                  disabled={isClearingPasscode}
                  className="btn-ghost btn-md"
                >
                  {isClearingPasscode ? 'Removing…' : 'Remove passcode'}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <button onClick={() => navigate(-1)} className="btn-ghost btn-md mt-7">
        ← Back
      </button>

      {showHandoff && <HandoffDialog onClose={() => setShowHandoff(false)} />}

      {showPasscodeNumpad && (
        <Numpad
          title={user?.hasPasscode ? 'Change your passcode' : 'Choose a passcode'}
          minLength={4}
          maxLength={8}
          submitLabel="Save"
          submittingLabel="Saving…"
          onSubmit={setPasscode}
          onSuccess={() => {
            setShowPasscodeNumpad(false);
            showToast('Passcode saved');
          }}
          onDismiss={() => setShowPasscodeNumpad(false)}
        />
      )}
    </div>
  );
}
