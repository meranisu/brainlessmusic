import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePlayer } from '../components/PlayerBar';
import { DataSaverIcon, VolumeIcon } from '../components/icons';
import { useRef, useState, type FormEvent } from 'react';
import { HandoffDialog } from '../components/HandoffDialog';
import { LibraryBrowseDialog } from '../components/LibraryBrowseDialog';
import { Numpad } from '../components/Numpad';
import { PasswordInput } from '../components/PasswordInput';
import { useToast } from '../components/ToastProvider';
import { ApiError, apiClient } from '../lib/apiClient';
import { formatScanStatus } from '../lib/format';
import { applyTheme, isTheme, loadTheme, THEMES, type ThemeId } from '../lib/theme';
import { FADE_LENGTHS, type BetweenSongs, type TransitionPrefs } from '../lib/transitions';
import type { AddLibraryRootResponse, LibraryRoot, LibraryRootListResponse, LibraryRootScanResult } from '../types/api';

const BETWEEN_SONGS: { id: BetweenSongs; name: string; detail: string }[] = [
  { id: 'gapless', name: 'Gapless', detail: 'One song straight into the next' },
  { id: 'crossfade', name: 'Crossfade', detail: 'The next song fades in over the end' },
  { id: 'fadeOutIn', name: 'Fade out, then in', detail: 'A soft dip between songs' },
];

/** A71 and A72: what happens between songs, and the short fade on pause and skip. Per device, like data saver. */
function TransitionSettings({
  prefs,
  onChange,
  canFade,
}: {
  prefs: TransitionPrefs;
  onChange: (prefs: TransitionPrefs) => void;
  canFade: boolean;
}) {
  if (!canFade) {
    return (
      <p className="mt-2 rounded-lg border border-blue-800 bg-blue-900/60 px-4 py-3 text-xs text-blue-300">
        Songs play back to back with no gap. Fades aren't available here: this browser doesn't let a page change the
        volume (iPhone and iPad).
      </p>
    );
  }

  const fading = prefs.betweenSongs !== 'gapless';
  return (
    <div className="mt-2 space-y-2">
      <div className="rounded-lg border border-blue-800 bg-blue-900/60 px-4 py-3.5">
        <p className="text-sm font-medium text-white" id="between-songs">
          Between songs
        </p>
        {/* A radiogroup: the three rule each other out, which is the point (A71). */}
        <div role="radiogroup" aria-labelledby="between-songs" className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {BETWEEN_SONGS.map((option) => {
            const selected = prefs.betweenSongs === option.id;
            return (
              <button
                key={option.id}
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ ...prefs, betweenSongs: option.id })}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  selected
                    ? 'border-orange-500 bg-orange-600/12'
                    : 'border-blue-800 bg-blue-950/40 hover:border-blue-600 hover:bg-blue-800/60'
                }`}
              >
                <span className="block text-sm text-white">{option.name}</span>
                <span className="block text-xs text-blue-300">{option.detail}</span>
              </button>
            );
          })}
        </div>
        {fading && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-blue-300" id="fade-length">
              Fade length
            </span>
            <div role="radiogroup" aria-labelledby="fade-length" className="flex gap-1">
              {FADE_LENGTHS.map((seconds) => {
                const selected = prefs.fadeSeconds === seconds;
                return (
                  <button
                    key={seconds}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onChange({ ...prefs, fadeSeconds: seconds })}
                    className={`min-w-11 rounded-md border px-2.5 py-1.5 text-xs tabular-nums transition-colors ${
                      selected
                        ? 'border-orange-500 bg-orange-600/12 text-white'
                        : 'border-blue-800 text-blue-200 hover:border-blue-600'
                    }`}
                  >
                    {seconds} s
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {fading && (
        <ToggleRow
          label="Keep albums gapless"
          detail="No fade between tracks of one album played in order, so live albums and mixes stay seamless"
          checked={prefs.keepAlbumsGapless}
          onChange={() => onChange({ ...prefs, keepAlbumsGapless: !prefs.keepAlbumsGapless })}
        />
      )}
      <ToggleRow
        label="Fade on pause and skip"
        detail="A quick fade instead of a hard stop"
        checked={prefs.fadeOnPause}
        onChange={() => onChange({ ...prefs, fadeOnPause: !prefs.fadeOnPause })}
      />
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  detail: string;
  icon?: React.ReactNode;
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
      {icon && <span className={`shrink-0 ${checked ? 'text-orange-500' : 'text-blue-400'}`}>{icon}</span>}
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
  unreachable: 'text-red-300',
};

function summarize(result?: LibraryRootScanResult): string | null {
  if (!result?.scan) return null;
  const { filesAdded, filesUpdated, unreadableDirs } = result.scan;
  const parts: string[] = [];
  if (filesAdded > 0) parts.push(`${filesAdded} new`);
  if (filesUpdated > 0) parts.push(`${filesUpdated} updated`);
  if (parts.length === 0) parts.push('No changes found');
  // Not fatal (e.g. System Volume Information), but said, so a sparse folder isn't mistaken for a bug.
  if (unreadableDirs > 0) {
    parts.push(`${unreadableDirs} folder${unreadableDirs === 1 ? '' : 's'} couldn't be read`);
  }
  return parts.join(', ');
}

/** Admin-only library folders, the UI over librarySync's root endpoints. Polls like the Control Center does. */
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
    // Found or missing tracks change the Library views too, and a removed folder's tracks leave favorites and playlists.
    queryClient.invalidateQueries({ queryKey: ['tracks'] });
    queryClient.invalidateQueries({ queryKey: ['favorites'] });
    queryClient.invalidateQueries({ queryKey: ['playlists'] });
    queryClient.invalidateQueries({ queryKey: ['playlist'] });
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
      showToast('Folder removed, along with its tracks. The files are still on disk.');
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
                    ? `${root.trackCount} ${root.trackCount === 1 ? 'track' : 'tracks'}`
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
                <button onClick={() => setRemoveTarget(root)} className="btn-ghost btn-sm text-red-300!">
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
        The path is read from inside this server's own container. A drive that isn't already
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
              {removeTarget.trackCount === 0
                ? 'It has no tracks in the library, so nothing else changes.'
                : `This takes its ${removeTarget.trackCount === 1 ? 'one track' : `${removeTarget.trackCount} tracks`} out of the library, with their favorites, playlist entries and play history.`} You can't undo it. The music files stay
              on disk, so adding the folder again scans them back in as new tracks.
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
 * The options screen, a page announced by the interstitial. Holds data saver (the player bar only renders while
 * playing) and themes.
 */
export function OptionsPage() {
  const { user, logout, setPasscode, clearPasscode, setDisplayName } = useAuth();
  const { dataSaver, setDataSaver, transitions, setTransitions, canFade } = usePlayer();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [showHandoff, setShowHandoff] = useState(false);
  const [showPasscodeNumpad, setShowPasscodeNumpad] = useState(false);
  const [isClearingPasscode, setIsClearingPasscode] = useState(false);
  /* The pick made here, else the profile's (which may load after this page first paints), else the browser's copy. */
  const [picked, setPicked] = useState<ThemeId | null>(null);
  const theme: ThemeId = picked ?? (isTheme(user?.theme) ? user.theme : loadTheme());
  // Saves run one after another, so quick clicks can't land out of order and leave an earlier pick saved.
  const themeSaveRef = useRef<Promise<unknown>>(Promise.resolve());

  function chooseTheme(id: ThemeId) {
    applyTheme(id);
    setPicked(id);
    themeSaveRef.current = themeSaveRef.current
      .then(() => apiClient.put('/me/theme', { theme: id }))
      .catch(() => showToast('Theme changed here, but not saved to your profile. Try again later.', 'error'));
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
        {/* Swatches paint from each theme's own variables (`data-swatch`), so they can't drift. */}
        {/* A radiogroup, not toggle buttons: `aria-pressed` would announce independent on/off states. */}
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
          Saved to your profile, so it follows you to any device you sign in on.
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
        {/* Hidden where the browser ignores volume (iPhone, iPad), like the fades below. */}
        {canFade && (
          <div className="mt-2">
            <ToggleRow
              label="Volume levelling"
              detail="Every song plays at about the same loudness"
              icon={<VolumeIcon className="h-5 w-5" />}
              checked={transitions.levelVolume}
              onChange={() => setTransitions({ ...transitions, levelVolume: !transitions.levelVolume })}
            />
          </div>
        )}
        <TransitionSettings prefs={transitions} onChange={setTransitions} canFade={canFade} />
      </section>

      {user?.isAdmin && <LibrarySection />}

      {user && <NameSection key={user.displayName} current={user.displayName} onSave={setDisplayName} />}

      <section className="mt-7">
        <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">
          This device
        </h2>
        {user?.isGuest ? (
          <div className="rounded-lg border border-blue-800 bg-blue-900/60 p-4">
            <p className="text-sm text-blue-100">
              You are listening as a guest, <span className="font-medium text-white">{user.displayName}</span>.
            </p>
            <p className="mt-1 text-xs text-blue-400">
              If you came in with a guest code, type it on another device to listen there as the same guest. Without
              one, this browser is the only way back in, so moving means carrying this identity across.
            </p>
            <button onClick={() => setShowHandoff(true)} className="btn-secondary btn-md mt-3">
              Move or forget this device
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-blue-800 bg-blue-900/60 p-4">
            <p className="text-sm text-blue-100">
              Signed in as <span className="font-medium text-white">{user?.username}</span>
              {user && user.displayName !== user.username && (
                <span className="text-blue-300"> ({user.displayName})</span>
              )}
              {user?.isAdmin && <span className="badge-admin ml-2">Admin</span>}
            </p>
            <button onClick={logout} className="btn-secondary btn-md mt-3">
              Log out
            </button>
          </div>
        )}
      </section>

      {/* Sign-in by email (A192), and a password reset by email later (A189). Guests have none. */}
      {user && !user.isGuest && <EmailSection current={user.email} />}

      {/* Passcodes are self-service only, so this is where they're managed. Guests have none. */}
      {user && !user.isGuest && (
        <section className="mt-7">
          <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">
            Passcode
          </h2>
          <div className="rounded-lg border border-blue-800 bg-blue-900/60 p-4">
            <p className="text-sm text-blue-100">
              {user.hasPasscode
                ? 'A passcode is set. Sign in with it instead of your password.'
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

/** The name shown on the welcome screen and to the admin (A68). Remounted by key when the saved name changes. */
function NameSection({ current, onSave }: { current: string; onSave: (name: string) => Promise<void> }) {
  const { showToast } = useToast();
  const [name, setName] = useState(current);
  const [isSaving, setIsSaving] = useState(false);
  const unchanged = name.trim() === current;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (unchanged || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(name);
      showToast('Name saved');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not save your name', 'error');
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-7">
      <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">Your name</h2>
      <form onSubmit={save} className="rounded-lg border border-blue-800 bg-blue-900/60 p-4">
        <label htmlFor="display-name" className="mb-1 block text-sm text-blue-200">
          Shown when you sign in, and to the admin
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={32}
            autoComplete="nickname"
            aria-describedby="display-name-hint"
            className="input min-w-0 flex-1"
          />
          <button type="submit" disabled={unchanged || isSaving} className="btn-secondary btn-md">
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p id="display-name-hint" className="mt-1 text-xs text-blue-300">
          Clear it and save to go back to the default.
        </p>
      </form>
    </section>
  );
}

function EmailSection({ current }: { current: string | null }) {
  const { refreshUser } = useAuth();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  // Changing one already set takes the current password (the server checks too).
  const needsPassword = current !== null && email.trim().toLowerCase() !== current;

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.put('/me/email', { email: email.trim(), password: needsPassword ? password : undefined });
      await refreshUser();
      setEditing(false);
      setPassword('');
      showToast('Email saved');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not save the email', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-7">
      <h2 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-blue-400">Email</h2>
      <div className="rounded-lg border border-blue-800 bg-blue-900/60 p-4">
        {editing ? (
          <form onSubmit={save}>
            <label htmlFor="options-email" className="sr-only">
              Email
            </label>
            <input
              id="options-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
              className="input w-full"
            />
            {needsPassword && (
              <>
                <label htmlFor="options-email-password" className="mt-3 mb-1 block text-sm text-blue-200">
                  Current password
                </label>
                <PasswordInput
                  id="options-email-password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  required
                />
              </>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={saving || !email.trim() || (needsPassword && !password)}
                className="btn-primary btn-md"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setPassword('');
                }}
                disabled={saving}
                className="btn-ghost btn-md"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-sm break-all text-blue-100">
              {current ?? 'No email yet. Add one to sign in with it.'}
            </p>
            <button
              onClick={() => {
                setEmail(current ?? '');
                setEditing(true);
              }}
              className="btn-secondary btn-md mt-3"
            >
              {current ? 'Change email' : 'Add email'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
