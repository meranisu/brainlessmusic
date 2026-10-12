# First-run setup (Android)

Owner request, 2026-10-12. Decisions: A139 (steps), A140 (guests too), A141 (accounts already signed in skip it), A142 (per account).

| Phase | State |
|---|---|
| Plan | Done: after a phone's first sign-in, once; four steps; each skippable; the welcome plays at the end |
| Structure | Done: `setup_accounts` in `AppearanceSettings`, `StartViewModel.signedIn` / `setupFinished`, `Routes.SETUP` |
| Interior | Done: `ui/setup/SetupScreen.kt`, reusing `SettingsViewModel` and Settings' colour tiles |
| Walkthrough | Open: not tried on a phone. A fresh install (or the `.debug` app beside the release one) shows it |

## How it works

- `setup_accounts` (a phone preference) lists the usernames that have done the setup here, guests by their server
  username. A reinstall or clearing the app's data empties it; signing the same account out and in again doesn't.
- Signing in: `StartViewModel.signedIn` goes to `setup` when the account isn't in the list, otherwise to Home with the
  welcome.
- Opening on a saved session adds that account, so accounts signed in before this shipped never see it (A141).
- Steps: what the app is; light or dark, skin, colours (picking a game skin also picks its colours); volume
  levelling, auto-play on resume, data saver; done. Every choice is saved as it's made, through Settings' own
  setters, so "Skip setup" keeps what was picked.
- "Start listening" (or skip) sets the flag, opens Home and plays the welcome in the chosen skin.

## Change log

- 2026-10-12: built in one pass (v0.3.62, one flag per phone).
- 2026-10-12: per account instead (A142).
