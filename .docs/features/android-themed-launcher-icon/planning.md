# Android launcher icon follows the colour theme

## Goal

Let the Android app's home-screen icon take the colours of the picked colour theme (Deep blue, Crimson, Void, Nord,
Magenta, Pastel), so the icon matches the app once it opens. Not on the roadmap; owner idea from 2026-10-11 chat.

Decided: opt-in, off by default (A79); switch only in the background while nothing plays (A80); same art,
recoloured (A81). See `.docs/QUESTIONS.md`.

## How it works (and why it is not simpler)

Android has no API for an app to repaint its own launcher icon. The standard route:

1. Each icon is a separate **launcher entry**. `MainActivity` keeps its own `LAUNCHER` intent filter and stays the
   Deep blue icon (so existing home-screen shortcuts survive the update). Five `<activity-alias>` entries, one per
   other theme, point at `MainActivity`, each with its own `android:icon`, all `android:enabled="false"`.
2. To switch, the app enables the wanted entry and disables the rest with
   `PackageManager.setComponentEnabledSetting(..., DONT_KILL_APP)`. Exactly one entry is enabled at any time, or the
   app shows twice (or not at all) in the app drawer.
3. The launcher notices the change on its own schedule. Known launcher behaviour, varies by brand:
   - Stock / Pixel: icon updates in a second or two; home-screen shortcut is kept.
   - Samsung One UI, Xiaomi MIUI/HyperOS: may **remove the home-screen shortcut**, may close the app despite
     `DONT_KILL_APP`, may take until the next launcher restart. This is the main risk, and why the switch timing matters.

Things that do **not** change: the app's package name, `MainActivity` itself, the notification's tap target
(`PlaybackService.kt:50` uses `MainActivity::class`, unaffected by aliases), the in-app splash
(`SplashScreen.kt:82` draws `ic_launcher_foreground` directly; it could follow the theme in Compose, out of scope here).

Material You keeps the default Deep blue entry. Android 13+ "themed icons" already tint it from the wallpaper through
the existing monochrome layer (`res/mipmap-anydpi/ic_launcher.xml`), which is the Material You idea anyway.

## Icon colours

Same art as today, recoloured from each theme's palette (`ui/theme/Color.kt`). Today's icon maps onto the palette:

| Icon layer | Today (Deep blue) | Palette token |
|---|---|---|
| Background square | `#080E28` | `ground` |
| Background circle | `#162456` | `blue950` |
| Disc with waveform | `#FF5400` | `accent` |
| Satellite dot | `#FDBA74` | none: a lighter accent, picked per theme by eye |

So each theme needs one background drawable and one foreground drawable (about 10 small vector XML files, a few KB).
The monochrome layer is shared. The icon uses the dark palette whatever the light/dark setting, as today.

Watch: Void's `ground` and `blue950` are both near-black, so its circle will barely show. Fine for "Void", but check it
on a real home screen. Nord's accent `#D5895E` on its ground needs the same look.

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Decisions A79 to A81, this doc | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Drawables, manifest aliases, the switcher class | Not started | [Phase 2](#phase-2-structure) |
| 3. Interior | Settings toggle, switch timing hooked to app lifecycle and playback | Not started | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Real-phone testing on more than one launcher, docs, release | Not started | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

- [x] Confirm the icon is an adaptive vector with a monochrome layer (`res/mipmap-anydpi/ic_launcher.xml`)
- [x] Map icon colours onto palette tokens (table above)
- [x] A79: opt-in toggle, off by default
- [x] A80: switch in the background while nothing plays, else at the next cold start
- [x] A81: recolour only
- [ ] Owner sees a side-by-side preview of the six icons before Phase 2 is merged

## Phase 2: Structure

- [ ] `res/drawable/ic_launcher_background_<theme>.xml` and `ic_launcher_foreground_<theme>.xml` for Crimson, Void,
      Nord, Magenta, Pastel (Deep blue keeps the current files)
- [ ] `res/mipmap-anydpi/ic_launcher_<theme>.xml` and `_round` variants, sharing `ic_launcher_monochrome`
- [ ] Manifest: five `<activity-alias>` entries (`.LauncherCrimson`, etc.), `targetActivity=".MainActivity"`,
      `enabled="false"`, `exported="true"`, each with the `MAIN`/`LAUNCHER` filter and its own icon
- [ ] `LauncherIconSwitcher` (in `data/local/` or a new `ui/icon/`): maps `ColorTheme` to a component name
      (`MATERIAL_YOU` and `DEEP_BLUE` map to `MainActivity`), reads which entry is currently enabled, and enables the
      target **before** disabling the old one so there is never a moment with no launcher entry
- [ ] No-op when the wanted entry is already the enabled one (avoid poking the launcher on every start)
- [ ] Unit test the theme to component mapping (every `ColorTheme` maps to exactly one entry)

## Phase 3: Interior

- [ ] `AppearanceSettings`: new boolean `match_icon_to_theme`, default off (A79)
- [ ] Settings screen: a switch under the colour theme picker, "Match app icon to theme", with a one-line note that
      some phones move or remove the home-screen shortcut when it changes
- [ ] Switch timing (A80): watch `ProcessLifecycleOwner`; on app going to the background, apply the pending icon
      only if `PlaybackController` reports nothing playing. Otherwise apply on the next background-while-idle, or at
      the next cold start before the UI shows
- [ ] Turning the toggle off restores the default entry (same timing rule)
- [ ] Theme changes from the profile (A78: login, guest entry, cold start) go through the same pending-switch path,
      so a theme picked on the web changes the phone icon only when the toggle is on
- [ ] Guest sessions: follow whatever theme the app is showing; nothing special

## Phase 4: Walkthrough

- [ ] Fresh install and upgrade from v0.3.14: one icon in the drawer, existing home shortcut still works
- [ ] Switch through all six themes on a Pixel or stock-ish launcher: icon updates, app not killed
- [ ] Same on a Samsung phone (if available): note whether the shortcut survives; adjust the Settings note to match
- [ ] Switch while music plays: icon waits, music keeps going, icon changes after pausing and leaving the app
- [ ] Material You and Android 13+ themed icons: the wallpaper-tinted icon still shows
- [ ] `./gradlew assembleDebug` and lint pass; unit tests pass
- [ ] CHANGELOG, FUNCTIONLOG, release notes (`android/release-notes/vX.Y.Z.md`)
- [ ] Debug CI build, then release via Actions

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
