---
name: device-check
description: Walk through an Android feature on the emulator or the owner's Poco F5 and capture screenshots, against a throwaway local backend or production. Use when asked to phone-test, emulator-check or device-check a change, or before calling an Android UI change done.
---

Check an Android change on a real screen and show the owner what it looks like. The point is evidence: screenshots
read back and described, not "it installed".

## 0. Pick target and server

- **Device:** the emulator by default. Use the Poco F5 only when the owner says it is plugged in.
- **Server:**
  - **Throwaway local** (default for unreleased changes): build with `-PserverUrl=http://10.0.2.2:3100`.
  - **Production** (`https://music.nobrainmusic.my`): only for code already deployed. Install the release APK from
    `gh release download vX.Y.Z -p "*.apk"`. Sign in with the owner's test account; the login is in Claude's memory
    (`android-emulator-wsl`), never in the repo. No test account to hand: ask the owner.
- Never point a debug build at production to try unreleased code against real users' data.

## 1. Memory first

The box has 7.7 GB. Run `free -h`. Stop idle daemons in **their own** Bash call (a `pkill -f` pattern that appears in your
own command line kills the shell):

```bash
cd android && ./gradlew --stop
```

Check `pgrep -af '[G]radleWrapperMain'` is empty before starting a build or the emulator.

## 2. Throwaway backend (local server only)

All state under the session scratchpad (`$S` below). Never read `backend/.env`; set every var on the command line
(dotenv does not override vars already set). Never point `LIBRARY_PATH` at the owner's library root.

```bash
mkdir -p $S/{db,lib,art,avatars,transcode,staging,backup}
cp "/mnt/d/Music/<a few files>" $S/lib/     # 5 or 6 songs is enough
cd backend
export DB_PATH=$S/db/test.db LIBRARY_PATH=$S/lib ARTWORK_PATH=$S/art AVATAR_PATH=$S/avatars \
  TRANSCODE_PATH=$S/transcode UPLOAD_STAGING_PATH=$S/staging BACKUP_PATH=$S/backup \
  BACKUP_ENABLED=false JWT_SECRET=throwaway PORT=3100
npx tsx src/scripts/seed-users.ts           # migrates, then makes the seed admin accounts
npx tsx src/index.ts                        # run_in_background
```

Scans are on by default (`LIBRARY_SCAN_ENABLED`). To force one, sign in as a seed admin and `POST /api/library/scan`
(`backend/src/routes/library.ts`). Re-check these var names
against `backend/src/config.ts` if the server will not start.

## 3. Build (local server only)

The emulator and Gradle do not fit in RAM together. Stop the emulator first (`adb emu kill`), then build with
`run_in_background` and no `timeout` wrapper (a cold build can take over 10 minutes):

```bash
cd android && ./gradlew assembleDebug -PserverUrl=http://10.0.2.2:3100 --console=plain > $S/gradle.log 2>&1
```

Read the log for `BUILD SUCCESSFUL`; a background task reports "completed" either way. Then `./gradlew --stop`.

## 4. Device up and install

- **Emulator:** `scripts/emulator.sh` (picks the 4 GB or 2 GB AVD by free RAM). adb is `~/Android/sdk/platform-tools/adb`.
  The 4 GB AVD shows a System UI ANR on first boot: tap Wait.
- **Poco F5:** Windows adb, `/mnt/c/platform-tools/adb.exe`, USB only (wireless pairing fails). If it lists nothing,
  `adb.exe kill-server` and retry. Taps need "USB debugging (Security settings)" on.

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p com.brainlessmusic.app.debug 1     # release build: com.brainlessmusic.app
```

## 5. Drive and capture

- Find a target: `adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml $S/` then grep `text=` /
  `content-desc=` for its `bounds`. Slow (about 15 s); re-dump after the keyboard opens, Compose shifts the layout.
- Act: `adb shell input tap X Y`, `input text 'abc'`, `input keyevent KEYCODE_BACK`, `input swipe x1 y1 x2 y2 300`.
- Capture: `adb exec-out screencap -p > $S/shot-<step>.png`, then Read the PNG and say what it shows.
- Motion (marquee, animations): `adb shell screenrecord --time-limit 8 /sdcard/r.mp4`, pull it, then
  `ffmpeg -i r.mp4 -vf fps=1,scale=270:-1,tile=8x1 $S/sheet.png` and Read the sheet.
- Skins: check every skin the change touches, not only Standard.

## 6. Report and clean up

1. List each thing checked with pass/fail and the screenshot behind it. Name what was **not** checked (guest view,
   real phone, other skins) instead of implying it.
2. Send the key screenshots to the owner if they are following remotely.
3. Kill the throwaway backend by port (`fuser -k 3100/tcp`), never by `pkill -f` on a pattern in your own command line.
4. `adb emu kill`. Delete `$S/db`; it holds password hashes.
5. Update the feature's memory note: what was device-checked and when.
