#!/usr/bin/env bash
# Start a headless Android emulator for testing the app.
# Picks the 4 GB device when enough RAM is free, else the 2 GB one.
# Stops Gradle and Kotlin daemons first to reclaim memory.
set -euo pipefail

SDK="${ANDROID_SDK_ROOT:-$HOME/Android/sdk}"
EMU="$SDK/emulator/emulator"
ADB="$SDK/platform-tools/adb"

if [ ! -r /dev/kvm ] || [ ! -w /dev/kvm ]; then
  echo "No access to /dev/kvm. Run: sudo usermod -aG kvm $USER, then wsl --shutdown." >&2
  exit 1
fi

if "$ADB" devices | grep -q '^emulator-'; then
  echo "An emulator is already running."
  exit 0
fi

avail_mb() { awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo; }

echo "Available before: $(avail_mb) MB"

# A daemon is busy if a gradlew client is running; never kill a live build.
if pgrep -f 'GradleWrapperMain|gradlew' >/dev/null; then
  echo "A Gradle build is running. Wait for it to finish, then retry." >&2
  exit 1
fi
if pgrep -f 'GradleDaemon|KotlinCompileDaemon' >/dev/null; then
  echo "Stopping idle Gradle and Kotlin daemons."
  pkill -f 'GradleDaemon|KotlinCompileDaemon' || true
  sleep 3
fi

AVAIL=$(avail_mb)
echo "Available now: $AVAIL MB"

# The emulator needs its guest RAM plus about 1 GB for itself.
if [ "$AVAIL" -ge 5500 ]; then
  AVD=brainless_4g
elif [ "$AVAIL" -ge 3200 ]; then
  AVD=brainless_2g
else
  echo "Only $AVAIL MB free; need 3200 MB for the 2 GB device. Close something and retry." >&2
  exit 1
fi

echo "Starting $AVD."
nohup "$EMU" -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot-save \
  -gpu swiftshader_indirect >"/tmp/$AVD.log" 2>&1 &

"$ADB" wait-for-device
until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
echo "Booted. Log: /tmp/$AVD.log"
