#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
REMOTE="${CONTROL_PLANE_DEPLOY_HOST:-virya-home}"
REMOTE_DIR="${CONTROL_PLANE_DEPLOY_REMOTE_DIR:-/srv/crowdrelay-control-plane}"
AREA_SOURCE="$ROOT_DIR/deploy/compose.area.production.yml"
TARGET="$(git -C "$ROOT_DIR" rev-parse HEAD)"
REMOTE_AREA="/tmp/crowdrelay-control-plane-area-bootstrap-${TARGET}.yml"

cleanup() {
  ssh -T "$REMOTE" "rm -f '$REMOTE_AREA'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for command in git ssh scp; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'ERROR: missing required command: %s\n' "$command" >&2
    exit 1
  }
done

[[ -f "$AREA_SOURCE" && ! -L "$AREA_SOURCE" ]] || {
  echo "ERROR: missing canonical area overlay: $AREA_SOURCE" >&2
  exit 1
}

scp -q "$AREA_SOURCE" "$REMOTE:$REMOTE_AREA"

ssh -T "$REMOTE" sudo bash -s -- "$REMOTE_DIR" "$REMOTE_AREA" <<'REMOTE_BOOTSTRAP'
set -Eeuo pipefail
umask 077
root="$1"
candidate="$2"
cd "$root"

for file in .env compose.production.yml "$candidate"; do
  [[ -f "$file" && ! -L "$file" ]] || {
    echo "ERROR: missing or unsafe bootstrap input: $file" >&2
    exit 1
  }
done
[[ "$(stat -c '%a' .env)" == "600" ]] || {
  echo 'ERROR: .env must have mode 600' >&2
  exit 1
}

docker compose -f compose.production.yml -f "$candidate" config --format json | python3 -c '
import json
import sys
model = json.load(sys.stdin)
app = model.get("services", {}).get("app", {})
env = app.get("environment") or {}
if isinstance(env, list):
    env = dict(item.split("=", 1) for item in env if isinstance(item, str) and "=" in item)
master = env.get("CONTROL_PLANE_MANAGEMENT_MASTER_KEY")
url = env.get("CONTROL_PLANE_VIRYA_MANAGEMENT_URL")
if not isinstance(master, str) or not master:
    raise SystemExit("candidate overlay does not wire CONTROL_PLANE_MANAGEMENT_MASTER_KEY")
if url != "http://127.0.0.1:18080":
    raise SystemExit("candidate overlay has invalid CONTROL_PLANE_VIRYA_MANAGEMENT_URL")
'

install -m 0644 "$candidate" compose.area.yml
docker compose -f compose.production.yml -f compose.area.yml config --quiet
printf 'BOOTSTRAP_OVERLAY=PASS management_wiring=canonical runtime_restarted=false\n'
REMOTE_BOOTSTRAP

exec bash "$ROOT_DIR/scripts/deploy-production-exact.sh" "$@"
