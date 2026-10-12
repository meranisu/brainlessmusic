# First-run setup (Android)

Owner request, 2026-10-12. Decisions: A139 (steps), A140 (guests too), A141 (phones already signed in skip it).

| Phase | State |
|---|---|
| Plan | Done: after a phone's first sign-in, once; four steps; each skippable; the welcome plays at the end |
| Structure | Done: `setup_done` in `AppearanceSettings`, `StartViewModel.signedIn` / `setupFinished`, `Routes.SETUP` |
| Interior | Done: `ui/setup/SetupScreen.kt`, reusing `SettingsViewModel` and Settings' colour tiles |
| Walkthrough | Open: not tried on a phone. A fresh install (or the `.debug` app beside the release one) shows it |

## How it works

- `setup_done` is a phone preference, so a reinstall or clearing the app's data brings the setup back; signing out
  and in again doesn't.
- Signing in: `StartViewModel.signedIn` goes to `setup` when the flag is unset, otherwise to Home with the welcome.
- Opening on a saved session sets the flag, so phones that were signed in before this shipped never see it (A141).
- Steps: what the app is; light or dark, skin, colours (picking a game skin also picks its colours); volume
  levelling, auto-play on resume, data saver; done. Every choice is saved as it's made, through Settings' own
  setters, so "Skip setup" keeps what was picked.
- "Start listening" (or skip) sets the flag, opens Home and plays the welcome in the chosen skin.

## Change log

- 2026-10-12: built in one pass.
