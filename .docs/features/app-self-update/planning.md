# In-app updates (Android)

## Goal

The app notices a newer GitHub Release, shows what changed since the installed version, downloads the APK, checks it
and hands it to Android's installer, so friends stop missing releases. Owner idea, 2026-10-11; decided in A104–A106
([QUESTIONS.md](../../QUESTIONS.md#answered)).

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | This doc | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Release check, download, checksum, install hand-off | Not started | [Phase 2](#phase-2-structure) |
| 3. Interior | Update sheet, settings row | Not started | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | A real update from one release to the next on a phone | Not started | [Phase 4](#phase-4-walkthrough) |

No server work: everything comes from GitHub.

---

## Phase 1: Plan

### Decided

| | Decision | From |
|---|---|---|
| When | On launch, at most once a day, plus "Check for updates" in Settings. Release builds only | A104 |
| Skip | The sheet has Install now, Later and Skip this version. A skipped version stays quiet until a newer one is out; the settings row still offers it | A105 |
| Notes | Every release newer than the installed one, newest first | A106 |

### What exists (checked 2026-10-11)

- `.github/workflows/android-release.yml` publishes `brainlessmusic-vX.Y.Z.apk` on each `vX.Y.Z` tag, with the body
  from `android/release-notes/vX.Y.Z.md` plus appended install instructions. `versionCode` is
  `major*10000 + minor*100 + patch`, so versions compare as numbers.
- The repo is public, so `api.github.com/repos/meranisu/brainlessmusic/releases` needs no token. Unauthenticated
  calls get 60 an hour per IP; once a day per phone is nowhere near that.
- **Checksum for free:** the API returns a `digest` for each asset (`sha256:...`). For v0.3.28 it matched
  `sha256sum` of the downloaded file exactly, so the release workflow doesn't need to publish a checksum file.
- Debug builds are `com.brainlessmusic.app.debug` (`applicationIdSuffix`), a different app to Android, so they never
  offer a release APK. The check is off when `BuildConfig.DEBUG`.
- No `REQUEST_INSTALL_PACKAGES` permission and no `FileProvider` in the manifest yet.
- `minSdk` 26, `targetSdk` 34.

### Approach

1. **Check:** `GET /releases?per_page=30`. Ignore drafts and pre-releases. Keep tags matching `vX.Y.Z` whose version
   is higher than `BuildConfig.VERSION_NAME`. The newest one with a `.apk` asset is the offer.
2. **Sheet:** the version and size, then each newer release's notes, newest first (A106). Only the part above the
   appended install instructions is shown; the notes' markdown is the same small set the web's What's new handles
   (headings, bullets, `**bold**`, `` `code` ``). Buttons: Install now, Later, Skip this version.
3. **Download:** with `DownloadManager` or the app's OkHttp into `cacheDir/updates/`, with progress on the sheet.
   Then compare SHA-256 with the asset's `digest`, and delete on a mismatch.
4. **Install:** `PackageInstaller` session (or `ACTION_VIEW` through a `FileProvider`). Needs
   `REQUEST_INSTALL_PACKAGES`. The first time, Android sends the user to "Install unknown apps" for this app: the
   sheet says so before the jump. The user always taps Install in Android's own dialog; nothing installs silently.
   The release key (`CN=brainlessmusic`) must match the installed app, or Android refuses. That's true for every
   release-key install since 2026-10-10.
5. **Playback:** installing kills the app, and the music with it. If something is playing, the sheet says so, and
   the queue is saved first (`PlaybackResume.flush()`).
6. **Remember:** last check time and a skipped version in DataStore. The settings row ignores both.

### Out (first version)

- Background checks (WorkManager) and update notifications: the launch check is enough for a handful of friends.
- Forced updates and minimum versions.
- Debug builds, and any update channel other than GitHub Releases.

## Phase 2: Structure

- [ ] `UpdateRepository`: fetch releases, pick the offer, compare versions (unit-tested: `0.3.9` < `0.3.10`, drafts
      and pre-releases ignored, a release without an APK skipped)
- [ ] Once-a-day gate and skip, in DataStore
- [ ] Download with progress, SHA-256 against `digest`, cleanup of old files
- [ ] `REQUEST_INSTALL_PACKAGES`, `FileProvider` or `PackageInstaller` hand-off; the "unknown apps" detour handled

## Phase 3: Interior

- [ ] Update sheet: notes since the installed version, size, Install now / Later / Skip this version, progress, a
      checksum or download failure with Retry
- [ ] Settings: "Check for updates" with "You're on the latest (v0.3.28)" when there's nothing
- [ ] Warns when music is playing; saves the queue before handing off

## Phase 4: Walkthrough

- [ ] On a phone with vN installed, publish vN+1: the sheet appears once on launch, Install works and the app
      reopens on the new version with the queue kept
- [ ] Skip this version: no sheet on the next launches; the settings row still offers it; vN+2 shows again
- [ ] Airplane mode on launch: no error shown, just no sheet

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-10-11 | Plan | Doc written from A104–A106 and the approach agreed in chat | Room sync landed, which this waited on | Yes |
