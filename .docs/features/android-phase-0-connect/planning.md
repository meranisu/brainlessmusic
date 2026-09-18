# Phase Plan — Android Phase 0 (Connect)

Roadmap boxes 15 (`.docs/process/development-roadmap.md`), full detail in
`.docs/process/android-phased-plan.md`'s "Phase 0 — Project & Connection
Foundation".

## Goal

Scaffold the Android app (Kotlin + Compose + Hilt + Retrofit) so it can be
pointed at a running backend, log in, and stay logged in across restarts —
with the four connection failure modes (unreachable host, bad credentials,
TLS failure, malformed URL) surfaced as distinct, readable errors rather than
one generic "something went wrong."

## Phase Overview

| Phase | What it covers | Status | Checklist |
|---|---|---|---|
| 1. Plan | Package layout, dependency choices, auth-flow scope decision | Done | [Phase 1](#phase-1-plan) |
| 2. Structure | Gradle project, DI graph, networking layer, encrypted session storage | Done | [Phase 2](#phase-2-structure) |
| 3. Interior | Server-config screen, home placeholder, navigation, error messaging | Done | [Phase 3](#phase-3-interior) |
| 4. Walkthrough | Build-verify, connect to a real backend, restart persistence | **Done-when met 2026-09-18: connect + login + restart persistence all confirmed on-device. Error-state paths (401 / unreachable / malformed URL) built but not yet exercised on-device.** | [Phase 4](#phase-4-walkthrough) |

---

## Phase 1: Plan

- [x] **Package:** `com.brainlessmusic.app`. **minSdk 26 / targetSdk 34 / compileSdk 34.** Single `app` Gradle module — a multi-module split isn't justified at Phase 0 scale and would add build-config risk with no way to verify it compiles in this environment.
- [x] **Stack, matching `.docs/reference/tech-stack.md`:** Kotlin, Jetpack Compose (Material3), Hilt, Retrofit + OkHttp, DataStore (Preferences). Gson over Moshi/kotlinx.serialization for the Retrofit converter — no extra annotation-processor setup to get wrong un-compiled.
- [x] **API surface confirmed by reading the live backend** (`backend/src/app.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/health.ts`), not assumed from the phased-plan doc, which predates the `/api` prefix and the guest-access rework:
  - `GET /api/health` → `{ status }`, unauthenticated — the reachability probe.
  - `POST /api/auth/login` → `{ username, password }` → `{ token }` on `200`, `401` on bad credentials (guest rows can never satisfy this — `password_hash` is `''`).
  - `GET /api/auth/me` (bearer) → `{ id, username, isAdmin, isGuest, hasPasscode }` — used to validate a stored token on cold start without forcing a re-login.
- [x] **Auth-flow scope decision, logged as [Q29](../../QUESTIONS.md#q29--should-android-phase-0-support-guest-entry-not-just-password-login) since the phased-plan doc predates guest access:** Phase 0 builds **password login only** (`POST /auth/login`), matching `.docs/process/android-phased-plan.md` as written. The web app's guest-entry door (`POST /auth/guest`, no credentials) exists for casual/friend access from a browser; this is the owner's own phone, and Phase 0's done-when ("user can enter server details once... credentials persist") assumes a real account. **Non-blocking, building on this assumption** — if guest entry on Android turns out to matter, it's an additive screen/repository method later, not a rework of what's built here.
- [x] **"Encrypted DataStore" resolved to a concrete mechanism.** DataStore itself has no built-in encryption (that's `EncryptedSharedPreferences`, a different API, and the phased-plan doc explicitly says *not* SharedPreferences). Built: an AndroidKeyStore-backed AES-256-GCM key (framework `javax.crypto`/`android.security.keystore`, no extra dependency) encrypts the JWT before it's written into a DataStore `Preferences` value; the key never leaves hardware-backed storage. Session data is excluded from Android auto-backup (`data_extraction_rules.xml`) since a restored backup on a new device can't decrypt a key that didn't travel with it — a silently-undecryptable stored token is worse than no stored token.
- [x] **Runtime-configurable base URL resolved.** Retrofit wants a fixed `baseUrl` at construction, but the server URL is only known once the user types it in. Built `ApiServiceFactory`, a cached-and-rebuilt-on-change factory instead of a Hilt-singleton `ApiService` — avoids the more invasive pattern of intercepting and rewriting request URLs in an OkHttp interceptor.

## Phase 2: Structure

- [x] Gradle project scaffold: version catalog (`gradle/libs.versions.toml`), root + `app` build scripts, manifest, resources (adaptive icon, backup/data-extraction rules, cleartext-traffic allowance — see note below).
- [x] Hilt DI graph: `NetworkModule` (OkHttp client + logging interceptor + `AuthInterceptor`), `DataStoreModule` (the `Preferences` DataStore instance).
- [x] `ApiService` (Retrofit interface: `health`, `login`, `me`) + DTOs matching the confirmed backend shapes above.
- [x] `CryptoManager` (AndroidKeyStore AES-GCM encrypt/decrypt) + `SessionStore` (DataStore-backed: server URL, username, encrypted token) + `TokenProvider` (in-memory `StateFlow<String?>` the interceptor reads synchronously — keeps I/O out of the OkHttp interceptor thread).
- [x] `AuthRepository`: `testConnection()`, `login()`, `restoreSession()`, `logout()` — one error-mapping function (`mapError`) shared by every network call, classifying `SSLException` / `UnknownHostException`+`ConnectException`+`SocketTimeoutException` / `HttpException(401)` / malformed-URL-before-the-request-is-even-made into the four distinct `ConnectionError` cases Phase 0 asks for.
- [x] **Cleartext HTTP is intentionally allowed** (`usesCleartextTraffic="true"`), because the whole point of this screen is pointing the app at a bare-HTTP dev backend (`http://10.0.2.2:3000`) and, per the roadmap, a LAN server that may not have TLS in front of it yet. The public deployment (box 13) puts real TLS at the edge via Cloudflare; this flag doesn't weaken that.

## Phase 3: Interior

- [x] `ServerConfigScreen` + `ServerConfigViewModel`: server URL field with a "Test connection" action (calls `/health`, shows the classified error inline), then username/password + "Log in" (calls `/auth/login`, same error classification, saves session on success).
- [x] `HomeScreen`: placeholder confirming the done-when — "Connected as `<username>`" plus a Log out action. Real content is Phase 1 (browsing) of the Android plan, not this one.
- [x] `SplashScreen` + `StartViewModel`: on cold start, calls `restoreSession()` (validates any stored token against `/auth/me` rather than trusting it blindly) and routes straight to Home on success, or to a prefilled ServerConfig (URL + username, never the password) on failure.
- [x] Error messages are one sentence each, mapped from `ConnectionError` to plain text — no stack traces or HTTP jargon in the UI.

## Phase 4: Walkthrough

- [x] **The "no JDK/Gradle/SDK in WSL2" assumption turned out to be wrong** — none of those need root. Installed user-space (no `sudo` — this session has no password for it): Temurin JDK 17 (`~/tools`), Android SDK command-line tools + `platform-tools` + `platforms;android-34` + `build-tools;34.0.0` (`~/Android/sdk`), and a standalone Gradle 8.7 used once to generate the project's real `gradlew`/`gradle-wrapper.jar` (now checked in — was previously "not checked in", see the change log). None of the tooling itself lives in the repo; reproduction steps are in `android/README.md`.
- [x] **`./gradlew :app:assembleDebug` — BUILD SUCCESSFUL**, `app/build/outputs/apk/debug/app-debug.apk` produced (18.0 MB). One real compile error found and fixed on the first attempt: `SplashScreen.kt` used the `by` property-delegate syntax on `collectAsStateWithLifecycle()` without importing `androidx.compose.runtime.getValue` (present in the other two screens, missed here) — Kotlin's compiler error was exact (`Type 'State<String?>' has no method 'getValue(...)' and thus it cannot serve as a delegate`), one-line fix. Nothing else in the scaffold needed changing — DI graph, Retrofit/Gson setup, Hilt codegen (`kaptDebugKotlin`, `hiltJavaCompileDebug`), and the Compose/Material3 code all compiled clean.
- [x] **`GET /api/health` confirmed reachable through the actual running tunnel** the owner is testing against (`https://knew-cycle-richards-sacrifice.trycloudflare.com` — a Cloudflare Quick Tunnel, not the planned permanent box-13 tunnel+Access setup) via a plain `curl`: `200 {"status":"ok"}`. This is exactly the request `ApiServiceFactory`/`AuthRepository.testConnection()` makes, so the server-config screen's "Test connection" should succeed unmodified against this URL. Quick Tunnels carry no Cloudflare Access gate, so no email/OTP step stands between the app and the backend the way box 13's eventual permanent setup will have.
- [x] **`./gradlew :app:lintDebug` run and two real findings fixed.** `AndroidManifest.xml`'s `android:roundIcon` pointed at `@mipmap/ic_launcher` instead of `@mipmap/ic_launcher_round` — the round variant existed but was never referenced, which lint caught as `R.mipmap.ic_launcher_round appears to be unused`. Also renamed `res/mipmap-anydpi-v26/` → `res/mipmap-anydpi/`: lint flagged the `-v26` qualifier as redundant since `minSdk` is already 26, so every supported device already satisfies it. **The rename briefly broke the build** (`AAPT: resource mipmap/ic_launcher not found`) — turned out to be stale incremental-build state from renaming a resource directory mid-session, not a real problem with the new path; `./gradlew clean` before rebuilding fixed it, and a re-run of lint confirmed both findings gone with no new ones introduced. Remaining lint output (33 warnings) is either informational (AGP 8.5.2→9.4.0 and Compose BOM 2024.09.00→2026.09.00 newer-versions-available — not bumped without re-verifying compatibility) or already-justified (the network-security-config's intentional cleartext allowance) or cosmetic (missing an Android-13+ monochrome icon variant — the launcher mark is already a placeholder, not worth chasing before a real one exists).
- [x] **Confirmed on a real device 2026-09-18** — owner's POCO F5, against the live Cloudflare Quick Tunnel (`https://knew-cycle-richards-sacrifice.trycloudflare.com`), logged in as `meran`. Home screen showed "Connected as meran," matching Phase 0's happy path exactly: test connection → log in → land on Home. First-ever real exercise of the full stack outside a compiler — DI graph, encryption, networking, and Compose UI together, not just each compiling in isolation.
- [x] **Restart persistence confirmed 2026-09-18** — owner killed and reopened the app on the same device; it landed straight on Home, still "Connected as meran," no re-login prompt. This is Phase 0's literal done-when (`.docs/process/development-roadmap.md` box 15: "the app confirms a connection and stays logged in across restarts") and it's now been exercised for real, not just inferred from `restoreSession()`'s code path.
- [ ] **Still not exercised on-device:** the three error paths — wrong password (`ConnectionError.Unauthorized`), unreachable host, malformed URL. All three are implemented in `AuthRepository.mapError()`/`validateUrl()` and reasoned through in Phase 1's plan above, but nothing has actually triggered them on a real device yet. Not blocking — Phase 0's stated done-when doesn't require it — but worth doing before calling the error-handling itself trustworthy.

---

## Change Log

| Date | Phase affected | What changed | Why | Still fits the Plan phase? |
|---|---|---|---|---|
| 2026-09-18 | Plan | Auth scope narrowed to password-login only, guest entry deferred | `.docs/process/android-phased-plan.md` predates guest access; logged as [Q29](../../QUESTIONS.md#q29--should-android-phase-0-support-guest-entry-not-just-password-login) rather than silently assumed | Yes — additive later |
| 2026-09-18 | Phase 4 | Reversed the "can't build without Android Studio" assumption — JDK/Android SDK/Gradle installed user-space in WSL2, project actually compiled | Root wasn't needed for any of it, only assumed; the owner asked to check before falling back to Windows-only development | Yes — Phase 4 was written expecting Android Studio to be the only way in, not that it's unnecessary for building |
