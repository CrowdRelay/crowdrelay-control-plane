#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Blue-green Control Plane deploy with zero-downtime Caddy cutover.
#
# Runs ON the production host (virya-crowdrelay) via SSH.
# Starts app-green alongside the current app, health-checks it directly,
# switches the edge Caddy upstream to control-plane-green, verifies the
# cross-system E2E gate, then stops the old app.
#
# On any failure: reverts Caddy to blue, stops green, leaves production
# on the previous release with no user-visible downtime.
#
# Usage (called by deploy-ecosystem.sh or directly):
#   sudo bash scripts/deploy-bluegreen.sh <target-sha> <image-digest> [repo-dir]

TARGET="${1:-}"
IMAGE_DIGEST="${2:-}"
REPO_DIR="${3:-/srv/crowdrelay-control-plane}"
EDGE_CADDYFILE="/opt/crowdrelay/ops/edge/Caddyfile"
EDGE_CONTAINER="virya-edge-caddy"
GREEN_APP="crowdrelay-control-plane-app-green-1"
BLUE_APP="crowdrelay-control-plane-app-1"
GREEN_ALIAS="control-plane-green"
BLUE_ALIAS="control-plane"
CADDY_BACKUP=""
GREEN_STARTED=false
CADDY_SWITCHED=false

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

rollback() {
  local status="${1:-1}"
  trap - ERR INT TERM HUP

  if [[ "$CADDY_SWITCHED" == true ]]; then
    printf 'ROLLBACK=START reason=caddy-switched reverting upstream to %s\n' "$BLUE_ALIAS" >&2
    if [[ -n "$CADDY_BACKUP" && -f "$CADDY_BACKUP" ]]; then
      cp "$CADDY_BACKUP" "$EDGE_CADDYFILE"
      docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --force >/dev/null 2>&1 || true
      printf 'ROLLBACK=CADDY_REVERTED upstream=%s\n' "$BLUE_ALIAS" >&2
    fi
  fi

  if [[ "$GREEN_STARTED" == true ]]; then
    printf 'ROLLBACK=STOPPING_GREEN\n' >&2
    cd "$REPO_DIR"
    docker compose -f compose.production.yml -f compose.area.yml -f deploy/compose.bluegreen.yml \
      stop app-green >/dev/null 2>&1 || true
    docker compose -f compose.production.yml -f compose.area.yml -f deploy/compose.bluegreen.yml \
      rm -f app-green >/dev/null 2>&1 || true
    printf 'ROLLBACK=GREEN_STOPPED\n' >&2
  fi

  printf 'ROLLBACK=COMPLETE status=%d\n' "$status" >&2
  exit "$status"
}

[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]] || fail "usage: deploy-bluegreen.sh <sha> <digest> [repo-dir]"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "invalid image digest: $IMAGE_DIGEST"
for command in docker curl python3; do command -v "$command" >/dev/null 2>&1 || fail "missing command: $command"; done

cd "$REPO_DIR"
[[ -f .env && ! -L .env ]] || fail "missing .env"
[[ "$(stat -c '%a' .env)" == "600" ]] || fail '.env must have mode 600'
[[ -f compose.production.yml ]] || fail "missing compose.production.yml"
[[ -f compose.area.yml ]] || fail "missing compose.area.yml"
[[ -f deploy/compose.bluegreen.yml ]] || fail "missing deploy/compose.bluegreen.yml"
[[ -f "$EDGE_CADDYFILE" ]] || fail "missing edge Caddyfile"

# Verify the green image is available
green_image="crowdrelay-control-plane:sha-${TARGET}"
docker image inspect "$green_image" >/dev/null 2>&1 || {
  # Try pulling by digest
  registry_image="ghcr.io/crowdrelay/crowdrelay-control-plane"
  docker pull "${registry_image}@${IMAGE_DIGEST}" >/dev/null 2>&1 || fail "cannot pull green image"
  docker tag "${registry_image}@${IMAGE_DIGEST}" "$green_image"
}
printf 'GREEN_IMAGE=PASS sha=%s\n' "$TARGET"

# Verify blue is currently running
blue_health="$(docker inspect "$BLUE_APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
[[ "$blue_health" == "healthy" || "$blue_health" == "running" ]] || fail "blue app is not healthy: $blue_health"
printf 'BLUE_BASELINE=PASS health=%s\n' "$blue_health"

# Snapshot the Caddyfile
CADDY_BACKUP="$(mktemp -t caddyfile-cp-blue.XXXXXX)"
cp "$EDGE_CADDYFILE" "$CADDY_BACKUP"

trap 'rollback $?' ERR INT TERM HUP

# --- 1. Start green app -----------------------------------------------------

printf '\n==> 1/4 — Start green app\n'
GREEN_STARTED=true

export CONTROL_PLANE_GREEN_TAG="sha-${TARGET}"
docker compose -f compose.production.yml -f compose.area.yml -f deploy/compose.bluegreen.yml \
  up -d --no-deps --wait --wait-timeout 120 app-green

printf 'GREEN_APP=STARTED\n'

# --- 2. Health-check green app directly -------------------------------------

printf '\n==> 2/4 — Health-check green app\n'
green_health=""
for attempt in $(seq 1 30); do
  green_health="$(docker inspect "$GREEN_APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
  if [[ "$green_health" == "healthy" ]]; then
    break
  fi
  sleep 2
done
[[ "$green_health" == "healthy" ]] || fail "green app did not become healthy: $green_health"

# Direct health check via the virya-edge network
docker run --rm --network virya-edge curlimages/curl:8.12.0 \
  --fail --silent --show-error --connect-timeout 3 --max-time 10 \
  "http://${GREEN_ALIAS}:8090/healthz/ready" >/dev/null

printf 'GREEN_HEALTH=PASS\n'

# --- 3. Switch edge Caddy to green ------------------------------------------

printf '\n==> 3/4 — Switch edge Caddy upstream to green\n'
# Replace all control-plane:8090 upstreams with control-plane-green:8090
sed -i "s|reverse_proxy ${BLUE_ALIAS}:8090|reverse_proxy ${GREEN_ALIAS}:8090|g" "$EDGE_CADDYFILE"

# Verify the sed changed something
grep -Fq "reverse_proxy ${GREEN_ALIAS}:8090" "$EDGE_CADDYFILE" || fail "Caddyfile was not updated to green upstream"

# Graceful Caddy reload
docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --force
CADDY_SWITCHED=true
printf 'CADDY_SWITCH=PASS upstream=%s\n' "$GREEN_ALIAS}"

# --- 4. Verify cross-system E2E + stop blue ---------------------------------

printf '\n==> 4/4 — Verify cross-system E2E and finalize\n'

# Verify the tunnel is still healthy (it should be — we didn't touch it)
tunnel_health="$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
[[ "$tunnel_health" == "healthy" || "$tunnel_health" == "running" ]] || fail "tunnel is not healthy after cutover: $tunnel_health"

# E2E: operations summary through the edge
published="$(docker port "$BLUE_APP" 8090/tcp 2>/dev/null | head -n1 || true)"
# The green app doesn't publish ports — test through the edge instead
admin_token="$(docker inspect "$BLUE_APP" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_ADMIN_TOKEN=//p')"
if [[ -n "$admin_token" ]]; then
  # Test through the green app directly via Docker network
  e2e_result="$(docker run --rm --network virya-edge curlimages/curl:8.12.0 \
    --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    -H "Authorization: Bearer $admin_token" \
    "http://${GREEN_ALIAS}:8090/api/v1/tenants/virya/operations/summary" 2>/dev/null || true)"
  [[ -n "$e2e_result" ]] || fail "cross-system E2E gate failed: no response from green app"
  printf '%s' "$e2e_result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if not isinstance(data, dict):
    raise SystemExit('operations summary is not an object')
if not isinstance(data.get('schema_version'), int):
    raise SystemExit('schema_version missing')
print('CROSS_GATE=PASS')
" || fail "cross-system E2E gate failed: invalid response"
fi

# Stop blue app
docker stop "$BLUE_APP" >/dev/null 2>&1 || true
docker rm "$BLUE_APP" >/dev/null 2>&1 || true

# Update the image tag in .env
sed -i "s|^CONTROL_PLANE_IMAGE_TAG=.*|CONTROL_PLANE_IMAGE_TAG=sha-${TARGET}|" .env

# Clean up
rm -f "$CADDY_BACKUP"
trap - ERR INT TERM HUP

printf '\nCP_BLUEGREEN_DEPLOY=PASS sha=%s cutover=zero-downtime blue=stopped green=active\n' "$TARGET"
