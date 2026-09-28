# brainlessmusic — Android client

Kotlin + Jetpack Compose. See `.docs/process/android-phased-plan.md` for the
phase order and `.docs/features/android-phase-0-connect/planning.md` for what
Phase 0 (this scaffold) actually built and why.

## Opening this project

Primary dev flow is still **Android Studio on Windows** — see
`.docs/process/dev-environment.md`. But as of 2026-09-18, WSL2 can also build
(not run — no emulator/device from here) this project directly: a JDK,
the Android SDK command-line tools, and Gradle were installed **user-space,
no root**, since `sudo` here needs a password this session doesn't have.
None of it lives in the repo (all under `~/tools` and `~/Android/sdk`,
outside the project) — a fresh WSL2 setup needs to redo this once:

```bash
# JDK 17 (Temurin)
mkdir -p ~/tools && cd ~/tools
curl -L -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk"
tar xzf jdk17.tar.gz && rm jdk17.tar.gz

# Android SDK command-line tools (license IDs current as of this writing)
mkdir -p ~/Android/sdk/cmdline-tools && cd ~/Android/sdk/cmdline-tools
curl -L -o cmdline-tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
unzip -q cmdline-tools.zip && rm cmdline-tools.zip && mv cmdline-tools latest

# Add to ~/.bashrc: JAVA_HOME, ANDROID_HOME/ANDROID_SDK_ROOT, and both bin/ dirs on PATH

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
echo "sdk.dir=$HOME/Android/sdk" > android/local.properties  # gitignored, machine-specific
```

`gradlew`/`gradle/wrapper/gradle-wrapper.jar` **are** checked in now (generated
from a standalone Gradle 8.7 install, `gradle wrapper --gradle-version 8.7`) —
`./gradlew :app:assembleDebug` builds `app/build/outputs/apk/debug/app-debug.apk`
without Android Studio. Verified working 2026-09-18 (caught one real bug: a
missing `androidx.compose.runtime.getValue` import in `SplashScreen.kt` that
only the compiler surfaced — see the planning doc's change log).

**Still can't run it from WSL2** — no emulator (no GPU/KVM passthrough) and
no device attached. Install the built APK on a physical device yourself
(`adb install app-debug.apk` from Windows, or copy the file over — it's
reachable from Windows at `\\wsl.localhost\Ubuntu\home\abcde\brainlessmusic\android\app\build\outputs\apk\debug\app-debug.apk`),
or open the project in Android Studio as before — it will happily use this
same `local.properties`/SDK if pointed at it, or install its own.

Versions in play: AGP 8.5.2, Gradle 8.7, Kotlin 1.9.24, Compose compiler
1.5.14, compileSdk/targetSdk 34, minSdk 26.

## Connecting to the backend during development

The app talks to one server, fixed at build time: `https://music.nobrainmusic.my` by default
(`SERVER_URL` in `app/build.gradle.kts`). To point a build at a dev backend, pass it on the command line:
`./gradlew assembleDebug -PserverUrl=http://10.0.2.2:3000`. The emulator does not see the host machine as
`localhost` — use `10.0.2.2`. See
`.docs/process/dev-environment.md`'s "Android emulator ↔ WSL2 backend
networking" section.

Release builds are HTTPS-only (`src/main/res/xml/network_security_config.xml`). Debug builds
override that file (`src/debug/res/xml/`) to allow plain HTTP, so a dev backend or a bare LAN
server works with `-PserverUrl=http://...`. The public deployment puts real TLS at the edge via
Cloudflare regardless.

## Small APK for the phones

`./gradlew :app:assembleRelease` → `app/build/outputs/apk/release/app-release.apk`, **about 2 MB** (the debug
APK is about 20 MB and stays that way — debug is unshrunk on purpose). What makes the difference:

- **R8 + resource shrinking** in release. Most of the size was `material-icons-extended`, which R8 cuts to the few
  icons the app uses. `proguard-rules.pro` keeps the API classes in `data/remote/dto` un-renamed, because Gson
  reads them by field name.
- **arm64 only** (POCO F5 and Xperia 5 V are both arm64) and **English strings only**. For an emulator or another
  phone: `-PallAbis` brings back x86 and 32-bit libs.
- The release build is signed with the local debug key so it installs over a debug install; a store release would
  need a real keystore. Release is also HTTPS-only.

A minified build can break at runtime in ways the compiler can't see (reflection). Anything that touches JSON,
Hilt or Retrofit should be re-checked on the phone with the release APK.

## What's built (Phase 0)

Server-config screen → test connection (`GET /api/health`) → login
(`POST /api/auth/login`) → JWT stored AES-GCM-encrypted (AndroidKeyStore) in
DataStore → session restored and validated (`GET /api/auth/me`) on cold
start. Four distinct connection-error states: unreachable host, wrong
credentials, TLS failure, malformed URL.

Not built: anything past Phase 0 — no browsing, no playback. See the phased
plan for what's next.
