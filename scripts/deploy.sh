#!/usr/bin/env bash
# Updates production (brainless-app on smol) to the latest main.
#
#   ./scripts/deploy.sh            pull, back up the database, rebuild, restart, wait for healthy
#   ./scripts/deploy.sh --force    same, even if there are no new commits (e.g. to rebuild after a .env change)
#   ./scripts/deploy.sh rollback   go back to the image that was running before the last deploy
#
# Run it on the server, from anywhere inside the clone. It only ever touches the
# brainless-app container; cloudflared keeps running throughout, so the site is
# down only for the few seconds the new container takes to boot.
#
# One image holds both the API and the web app (see Dockerfile), so this updates
# the backend and the frontend together. Migrations run on container start.

set -euo pipefail

SERVICE=brainless-app
IMAGE=brainlessmusic:local
PREVIOUS_IMAGE=brainlessmusic:previous
BRANCH=main
HEALTH_TIMEOUT_SECONDS=120
# Pre-deploy backups go in their own folder so the app's scheduled backup
# pruning (services/backup.ts) never counts or deletes them.
BACKUP_DIR=/data/backups/pre-deploy
BACKUP_KEEP=5

cd "$(dirname "$0")/.."

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mDeploy stopped: %s\033[0m\n' "$*" >&2; exit 1; }

container_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$SERVICE" 2>/dev/null)" = "true" ]
}

wait_for_healthy() {
  local waited=0 status
  while [ "$waited" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$SERVICE" 2>/dev/null || true)
    case "$status" in
      healthy) return 0 ;;
      unhealthy) return 1 ;;
    esac
    # A container that exited (bad .env, failed migration) never turns unhealthy.
    container_running || return 1
    sleep 3
    waited=$((waited + 3))
  done
  return 1
}

# Deletes image id $1 unless it is what tag $2 currently points at.
remove_image_unless() {
  local id=$1 keep
  keep=$(docker image inspect -f '{{.Id}}' "$2" 2>/dev/null || true)
  if [ -n "$id" ] && [ "$id" != "$keep" ]; then
    docker rmi "$id" >/dev/null 2>&1 || true
  fi
}

show_failure_logs() {
  echo
  echo "Last 40 log lines from $SERVICE:"
  docker compose logs --tail 40 "$SERVICE" || true
}

rollback() {
  docker image inspect "$PREVIOUS_IMAGE" >/dev/null 2>&1 \
    || fail "no $PREVIOUS_IMAGE image to go back to (no deploy has run yet from this script)."

  say "Switching $SERVICE back to the image from before the last deploy"
  local bad_image
  bad_image=$(docker image inspect -f '{{.Id}}' "$IMAGE" 2>/dev/null || true)
  docker tag "$PREVIOUS_IMAGE" "$IMAGE"
  docker compose up -d --no-deps --no-build --force-recreate "$SERVICE"

  say "Waiting for it to report healthy"
  if wait_for_healthy; then
    remove_image_unless "$bad_image" "$IMAGE"
    echo "Rolled back and healthy."
  else
    show_failure_logs
    fail "the previous image is not healthy either."
  fi

  cat <<EOF

Notes:
  - The code on disk is still the newer commit; the next deploy rebuilds from it.
    To pin the old code, run: git log --oneline -5, then git checkout <commit>.
  - Migrations that ran in the failed deploy are not undone. If the database
    itself is the problem, the copy taken right before that deploy is in the
    brainless-data volume under $BACKUP_DIR.
EOF
}

deploy() {
  local force=${1:-} replaced_image=""

  command -v docker >/dev/null || fail "docker is not installed."
  docker compose version >/dev/null 2>&1 || fail "'docker compose' is missing (on Manjaro: sudo pacman -S docker-compose)."
  [ -f .env ] || fail "no .env next to docker-compose.yml. It is created by hand; see .docs/ops/cloudflare-tunnel-deployment.md."

  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD)
  [ "$current_branch" = "$BRANCH" ] || fail "on branch '$current_branch', expected '$BRANCH'. Run: git checkout $BRANCH"

  # Local edits to tracked files would make the pull fail halfway or get
  # silently built into production. Stop and let a person decide.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git status --short
    fail "the files above were changed on this server. Commit them upstream, or discard with: git checkout -- <file>"
  fi

  say "Checking GitHub for new commits"
  git fetch --quiet origin "$BRANCH"
  local incoming
  incoming=$(git log --oneline "HEAD..origin/$BRANCH")
  if [ -z "$incoming" ] && [ "$force" != "--force" ]; then
    echo "Already up to date ($(git log -1 --format='%h %s')). Nothing to do."
    echo "To rebuild anyway (e.g. after editing .env): $0 --force"
    exit 0
  fi
  if [ -n "$incoming" ]; then
    echo "New commits:"
    echo "$incoming"
  fi

  if container_running; then
    say "Backing up the database before any migration runs"
    # db.backup() rather than a file copy: the database is in WAL mode and
    # live, and this is the same method the app's own backups use.
    docker exec "$SERVICE" node -e "
      const fs = require('fs');
      const Database = require('better-sqlite3');
      const dir = '$BACKUP_DIR';
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/\.\d+Z\$/, '').replace(/:/g, '-');
      const dest = dir + '/pre-deploy-' + stamp + '.db';
      new Database(process.env.DB_PATH).backup(dest).then(() => {
        const old = fs.readdirSync(dir).filter((f) => /^pre-deploy-.*\.db\$/.test(f)).sort();
        for (const f of old.slice(0, Math.max(0, old.length - $BACKUP_KEEP))) fs.unlinkSync(dir + '/' + f);
        console.log('Saved ' + dest);
      }).catch((e) => { console.error(e.message); process.exit(1); });
    " || fail "database backup failed; nothing was changed."

    # Keep the running image so `rollback` has something to go back to. The
    # image that was "previous" until now is deleted once the deploy succeeds.
    replaced_image=$(docker image inspect -f '{{.Id}}' "$PREVIOUS_IMAGE" 2>/dev/null || true)
    docker tag "$IMAGE" "$PREVIOUS_IMAGE"
  else
    echo "$SERVICE is not running, so there is no live database to back up first."
  fi

  if [ -n "$incoming" ]; then
    say "Pulling"
    git merge --ff-only --quiet "origin/$BRANCH" \
      || fail "could not fast-forward to origin/$BRANCH (this clone has its own commits?)."
  fi

  say "Building the new image (a few minutes; the site stays up meanwhile)"
  docker compose build "$SERVICE"

  say "Restarting $SERVICE"
  # --force-recreate: compose does not always notice that the tag now points
  # at a new image (seen in testing after a rollback) and would leave the old
  # container running while the health check below happily passes.
  docker compose up -d --no-deps --force-recreate "$SERVICE"

  say "Waiting for it to report healthy"
  if ! wait_for_healthy; then
    show_failure_logs
    fail "the new version did not come up healthy. To go back: $0 rollback"
  fi
  [ "$(docker inspect -f '{{.Image}}' "$SERVICE")" = "$(docker image inspect -f '{{.Id}}' "$IMAGE")" ] \
    || fail "$SERVICE is healthy but still running the old image. Run: docker compose up -d --force-recreate $SERVICE"

  # Remove only the one image this deploy made obsolete, never a blanket prune:
  # other projects' images on this box are not ours. rmi refuses (harmlessly)
  # if that image is still tagged or in use.
  # After a rollback, local and previous are the same image, and the "replaced"
  # one is the rollback target itself; skip it then.
  remove_image_unless "$replaced_image" "$PREVIOUS_IMAGE"

  say "Done. Now running $(git log -1 --format='%h %s')"
}

case "${1:-}" in
  rollback) rollback ;;
  ""|--force) deploy "${1:-}" ;;
  -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) fail "unknown option '$1'. Use --help." ;;
esac
