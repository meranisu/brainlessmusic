#!/usr/bin/env bash
# Deploys main to production on its own, once GitHub CI has passed for it. Run by a systemd timer on smol.
#
#   ./scripts/auto-deploy.sh                one check: deploy origin/main if it is new and CI passed
#   sudo ./scripts/auto-deploy.sh install   set up the timer (every 5 minutes) for the user who ran sudo
#   sudo ./scripts/auto-deploy.sh uninstall remove the timer; ./scripts/deploy.sh by hand still works
#
# Each check:
#   - Nothing new on origin/main: does nothing.
#   - CI still running or not started: does nothing; the next check looks again.
#   - CI failed: skips that commit. A later commit that passes is deployed.
#   - New commits touch nothing that goes into the image (android/, .docs/, ...): fast-forwards the clone, no restart.
#   - Otherwise runs ./scripts/deploy.sh. If that leaves the app unhealthy, runs ./scripts/deploy.sh rollback.
# A commit that failed to deploy is not retried; push a fix, or run ./scripts/deploy.sh by hand.
#
# Logs: journalctl -u brainless-auto-deploy -n 50

set -euo pipefail

BRANCH=main
WORKFLOW=ci.yml
SERVICE=brainless-app
UNIT=brainless-auto-deploy
INTERVAL=5min
# Paths the Docker image is built from (Dockerfile, .dockerignore) or that change how it runs (docker-compose.yml).
IMAGE_PATHS=(backend frontend Dockerfile .dockerignore docker-compose.yml)

cd "$(dirname "$0")/.."
REPO_DIR=$(pwd)
# Inside .git so it never shows up as a local edit, which deploy.sh refuses to build over.
STATE_FILE=.git/auto-deploy-skipped

log() { echo "auto-deploy: $*"; }

# owner/name from the origin URL, https or ssh form.
github_repo() {
  git remote get-url origin | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##'
}

# Prints success, failure, cancelled, ... once CI finished for $1; pending while it runs; none if it never ran.
ci_result() {
  local json status conclusion
  json=$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$(github_repo)/actions/workflows/$WORKFLOW/runs?head_sha=$1&per_page=1") \
    || { echo unknown; return; }
  # A run object has one top-level status and conclusion; nothing nested in it uses those keys.
  status=$(grep -m1 -o '"status": *"[a-z_]*"' <<<"$json" | sed -E 's/.*"([a-z_]*)"$/\1/' || true)
  conclusion=$(grep -m1 -o '"conclusion": *"[a-z_]*"' <<<"$json" | sed -E 's/.*"([a-z_]*)"$/\1/' || true)
  if [ -z "$status" ]; then echo none
  elif [ "$status" != completed ]; then echo pending
  else echo "${conclusion:-unknown}"
  fi
}

healthy() {
  [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$SERVICE" 2>/dev/null)" = healthy ]
}

check() {
  # Skip this check if an earlier one is still running (a deploy can take minutes).
  exec 9>.git/auto-deploy.lock
  flock -n 9 || exit 0
  git fetch --quiet origin "$BRANCH"
  local head target
  head=$(git rev-parse HEAD)
  target=$(git rev-parse "origin/$BRANCH")
  [ "$head" = "$target" ] && exit 0
  if [ "$(cat "$STATE_FILE" 2>/dev/null)" = "$target" ]; then
    exit 0
  fi
  local short=${target:0:7}

  case "$(ci_result "$target")" in
    success) ;;
    pending) log "$short: CI still running, checking again next time."; exit 0 ;;
    none) log "$short: CI has not started for it yet, checking again next time."; exit 0 ;;
    unknown) log "$short: could not ask GitHub for the CI result, checking again next time."; exit 0 ;;
    *) log "$short: CI did not pass, not deploying it. Waiting for a newer commit."
       echo "$target" >"$STATE_FILE"; exit 0 ;;
  esac

  if git diff --quiet "$head" "$target" -- "${IMAGE_PATHS[@]}"; then
    log "$short: nothing in the image changed, updating the clone without a restart."
    git merge --ff-only --quiet "origin/$BRANCH" || { echo "$target" >"$STATE_FILE"; log "could not fast-forward."; exit 1; }
    exit 0
  fi

  log "$short: CI passed, deploying."
  # Pinned to $target: deploy.sh fetches again, and a push that lands meanwhile hasn't passed CI yet.
  if DEPLOY_REF=$target ./scripts/deploy.sh; then
    exit 0
  fi
  echo "$target" >"$STATE_FILE"
  if docker inspect "$SERVICE" >/dev/null 2>&1 && ! healthy; then
    log "deploy left $SERVICE unhealthy, rolling back."
    ./scripts/deploy.sh rollback || log "rollback failed too; the site may be down. Look at: docker compose logs $SERVICE"
  else
    log "deploy failed (see above); the old version is still running."
  fi
  exit 1
}

install() {
  [ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo $0 install"; exit 1; }
  local user=${SUDO_USER:-}
  [ -n "$user" ] && [ "$user" != root ] || { echo "Run it with sudo from your own account, not as root."; exit 1; }
  id -nG "$user" | grep -qw docker || { echo "$user is not in the docker group, so the timer could not run docker."; exit 1; }

  cat >"/etc/systemd/system/$UNIT.service" <<EOF
[Unit]
Description=brainlessmusic: deploy main once CI has passed
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=$user
WorkingDirectory=$REPO_DIR
ExecStart=$REPO_DIR/scripts/auto-deploy.sh
EOF

  cat >"/etc/systemd/system/$UNIT.timer" <<EOF
[Unit]
Description=brainlessmusic: check for a new version every $INTERVAL

[Timer]
OnBootSec=2min
OnUnitInactiveSec=$INTERVAL

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now "$UNIT.timer"
  echo "Installed. Checks every $INTERVAL as $user in $REPO_DIR."
  echo "Logs: journalctl -u $UNIT -n 50    Next run: systemctl list-timers $UNIT.timer"
}

uninstall() {
  [ "$(id -u)" = 0 ] || { echo "Run with sudo: sudo $0 uninstall"; exit 1; }
  systemctl disable --now "$UNIT.timer" 2>/dev/null || true
  rm -f "/etc/systemd/system/$UNIT.service" "/etc/systemd/system/$UNIT.timer"
  systemctl daemon-reload
  echo "Removed. Deploy by hand with ./scripts/deploy.sh"
}

case "${1:-}" in
  "") check ;;
  install) install ;;
  uninstall) uninstall ;;
  -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) echo "Unknown option '$1'. Use --help."; exit 1 ;;
esac
