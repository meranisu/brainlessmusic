import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePlayer } from '../components/PlayerBar';
import { DataSaverIcon } from '../components/icons';
import { useState } from 'react';
import { HandoffDialog } from '../components/HandoffDialog';

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
 * Themes arrive next and get their own section. There is deliberately no
 * disabled placeholder for them: a greyed-out control that promises something
 * is worse than nothing at all.
 */
export function OptionsPage() {
  const { user, logout } = useAuth();
  const { dataSaver, setDataSaver } = usePlayer();
  const navigate = useNavigate();
  const [showHandoff, setShowHandoff] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-semibold uppercase tracking-[0.06em] text-white">
        Options
      </h1>
      <p className="mt-1 text-sm text-blue-300">Settings for this device.</p>

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

      <button onClick={() => navigate(-1)} className="btn-ghost btn-md mt-7">
        ← Back
      </button>

      {showHandoff && <HandoffDialog onClose={() => setShowHandoff(false)} />}
    </div>
  );
}
