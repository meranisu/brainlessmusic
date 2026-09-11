import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePlayer } from '../components/PlayerBar';
import { DataSaverIcon } from '../components/icons';
import { useState } from 'react';
import { HandoffDialog } from '../components/HandoffDialog';
import { applyTheme, loadTheme, THEMES, type ThemeId } from '../lib/theme';

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
 * Themes live here too, and cost the rest of the app nothing: Tailwind 4
 * compiles `bg-blue-900` to `var(--color-blue-900)`, so a theme is a block of
 * variable overrides and not a single component knows one exists. See
 * `lib/theme.ts`.
 */
export function OptionsPage() {
  const { user, logout } = useAuth();
  const { dataSaver, setDataSaver } = usePlayer();
  const navigate = useNavigate();
  const [showHandoff, setShowHandoff] = useState(false);
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
