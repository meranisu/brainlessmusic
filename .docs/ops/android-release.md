# Releasing the Android app

Decided in A44 (`.docs/QUESTIONS.md`): the APK is built, signed with a real release key and attached to a GitHub
Release by `.github/workflows/android-release.yml` whenever a version tag is pushed.

## Cutting a release

```bash
git push origin main
git tag v0.2.0          # vMAJOR.MINOR.PATCH, always higher than the last
git push origin v0.2.0
```

The tag becomes `versionName` (`0.2.0`) and `versionCode` (`major*10000 + minor*100 + patch`, here `200`), so each
release installs over the previous one. The run fails rather than publish if the secrets are missing or the APK is
not signed by `CN=brainlessmusic`. Friends download `brainlessmusic-v0.2.0.apk` from the repo's Releases page.

Turn on **Ask guests for a code** (web Users page) before handing the APK around: anyone who installs it can press
Guest.

## The key

- **Where:** `~/.brainlessmusic-signing/release.jks` and `password.txt` on the dev machine (mode 600), a copy in
  `~/claude-backups/brainlessmusic-signing-2026-10-10/`, and the GitHub Actions secrets `ANDROID_KEYSTORE_BASE64` and
  `ANDROID_KEYSTORE_PASSWORD`. Alias `brainlessmusic`; store and key share the password. Never commit either file.
- **SHA-256 fingerprint:** `7B:68:C5:92:EA:A8:6F:C6:C0:8F:2B:CE:2C:72:D3:75:41:39:FE:98:53:F4:69:12:4D:C9:50:D3:D4:EB:7F:0C`
- **Losing it** means no future APK can update an installed one; everyone would have to uninstall and reinstall.
  Keep a copy somewhere off this machine (a password manager or cloud drive).
- **Switching from the old builds:** APKs before this were signed with the local debug key. Android will not update
  one over the other, so the first release-key install needs an uninstall first (and a fresh login).

## Local signed build

```bash
cd android
D=~/.brainlessmusic-signing
BRAINLESS_KEYSTORE_PATH=$D/release.jks BRAINLESS_KEYSTORE_PASSWORD="$(cat $D/password.txt)" \
  ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs=-Xmx1536m
```

Without those env vars `assembleRelease` signs with the debug key, as before. The memory cap matters on this
machine: an uncapped build was OOM-killed (exit 137) on 2026-10-10.
