#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Blue-green Control Plane deploy with zero-downtime Caddy cutover.
#
# Runs ON the production host (virya-crowdrelay) via SSH.
#
# Alternating blue-green: detects which color is currently active and
# deploys to the other color. If blue (app) is running, starts app-green
# and switches Caddy to green. If green (app-green) is running, starts
# app (blue) and switches Caddy to blue.
#
# On any failure: reverts Caddy to the previous upstream, stops the new
# container, leaves production on the previous release with no
# user-visible downtime.
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
NEW_STARTED=false
CADDY_SWITCHED=false

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

rollback() {
  local status="${1:-1}"
  trap - ERR INT TERM HUP

  if [[ "$CADDY_SWITCHED" == true ]]; then
    printf 'ROLLBACK=START reason=caddy-switched reverting upstream to %s\n' "${CURRENT_ALIAS:-}" >&2
    if [[ -n "$CADDY_BACKUP" && -f "$CADDY_BACKUP" ]]; then
      cp "$CADDY_BACKUP" "$EDGE_CADDYFILE"
      docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --force >/dev/null 2>&1 || true
      printf 'ROLLBACK=CADDY_REVERTED upstream=%s\n' "${CURRENT_ALIAS:-}" >&2
    fi
  fi

  if [[ "$NEW_STARTED" == true ]]; then
    printf 'ROLLBACK=STOPPING_NEW\n' >&2
    cd "$REPO_DIR"
    if [[ "$DEPLOY_COLOR" == "green" ]]; then
      docker compose -f compose.production.yml -f compose.area.yml -f deploy/compose.bluegreen.yml \
        stop app-green >/dev/null 2>&1 || true
      docker compose -f compose.production.yml -f compose.area.yml -f deploy/compose.bluegreen.yml \
        rm -f app-green >/dev/null 2>&1 || true
    else
      docker compose -f compose.production.yml -f compose.area.yml \
        stop app >/dev/null 2>&1 || true
      docker compose -f compose.production.yml -f compose.area.yml \
        rm -f app >/dev/null 2>&1 || true
    fi
    printf 'ROLLBACK=NEW_STOPPED\n' >&2
  fi

  printf 'ROLLBACK=COMPLETE status=%d\n' "$status" >&2
  exit "$status"
}

[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]] || fail "usage: deploy-bluegreen.sh <sha> [digest] [repo-dir]"
# Digest is optional — if not provided, we rely on the SHA-based tag only
if [[ -n "$IMAGE_DIGEST" ]]; then
  [[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "invalid image digest: $IMAGE_DIGEST"
fi
for command in docker curl python3; do command -v "$command" >/dev/null 2>&1 || fail "missing command: $command"; done

cd "$REPO_DIR"
[[ -f .env && ! -L .env ]] || fail "missing .env"
[[ "$(stat -c '%a' .env)" == "600" ]] || fail '.env must have mode 600'
[[ -f compose.production.yml ]] || fail "missing compose.production.yml"
[[ -f compose.area.yml ]] || fail "missing compose.area.yml"
[[ -f deploy/compose.bluegreen.yml ]] || fail "missing deploy/compose.bluegreen.yml"
[[ -f "$EDGE_CADDYFILE" ]] || fail "missing edge Caddyfile"

# Verify the new image is available
new_image="crowdrelay-control-plane:sha-${TARGET}"
docker image inspect "$new_image" >/dev/null 2>&1 || {
  registry_image="ghcr.io/crowdrelay/crowdrelay-control-plane"
  if [[ -n "$IMAGE_DIGEST" ]]; then
    docker pull "${registry_image}@${IMAGE_DIGEST}" >/dev/null 2>&1 || fail "cannot pull image by digest"
    docker tag "${registry_image}@${IMAGE_DIGEST}" "$new_image"
  else
    docker pull "${registry_image}:sha-${TARGET}" >/dev/null 2>&1 || fail "cannot pull image by tag"
    docker tag "${registry_image}:sha-${TARGET}" "$new_image"
  fi
}
printf 'NEW_IMAGE=PASS sha=%s\n' "$TARGET"

# Detect which color is currently active and determine deploy direction.
# If blue (app) is running → deploy green. If green (app-green) is running
# → deploy blue. This alternates colors on each deploy.
blue_health="$(docker inspect "$BLUE_APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
green_health="$(docker inspect "$GREEN_APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"

if [[ "$blue_health" == "healthy" || "$blue_health" == "running" ]]; then
  DEPLOY_COLOR="green"
  CURRENT_APP="$BLUE_APP"
  CURRENT_ALIAS="$BLUE_ALIAS"
  NEW_APP="$GREEN_APP"
  NEW_ALIAS="$GREEN_ALIAS"
  printf 'BASELINE=BLUE health=%s → deploying green\n' "$blue_health"
elif [[ "$green_health" == "healthy" || "$green_health" == "running" ]]; then
  DEPLOY_COLOR="blue"
  CURRENT_APP="$GREEN_APP"
  CURRENT_ALIAS="$GREEN_ALIAS"
  NEW_APP="$BLUE_APP"
  NEW_ALIAS="$BLUE_ALIAS"
  printf 'BASELINE=GREEN health=%s → deploying blue\n' "$green_health"
else
  fail "no running app found: blue=$blue_health green=$green_health — run deploy-home.sh first to bootstrap"
fi

# Snapshot the Caddyfile
CADDY_BACKUP="$(mktemp -t caddyfile-cp-blue.XXXXXX)"
cp "$EDGE_CADDYFILE" "$CADDY_BACKUP"

trap 'rollback $?' ERR INT TERM HUP

# --- 1. Start new app -------------------------------------------------------

printf '\n==> 1/4 — Start %s app\n' "$DEPLOY_COLOR"
NEW_STARTED=true

if [[ "$DEPLOY_COLOR" == "green" ]]; then
  export CONTROL_PLANE_GREEN_TAG="sha-${TARGET}"
  docker compose -f compose.production.yml -f compose.area.yml -f deploy/compose.bluegreen.yml \
    up -d --no-deps --wait --wait-timeout 120 app-green
else
  # Deploy blue: override the image tag without modifying .env
  export CONTROL_PLANE_IMAGE_TAG="sha-${TARGET}"
  docker compose -f compose.production.yml -f compose.area.yml \
    up -d --no-deps --wait --wait-timeout 120 app
fi

printf 'NEW_APP=STARTED color=%s container=%s\n' "$DEPLOY_COLOR" "$NEW_APP"

# --- 2. Health-check new app directly ---------------------------------------

printf '\n==> 2/4 — Health-check %s app\n' "$DEPLOY_COLOR"
new_health=""
for attempt in $(seq 1 30); do
  new_health="$(docker inspect "$NEW_APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
  if [[ "$new_health" == "healthy" ]]; then
    break
  fi
  sleep 2
done
[[ "$new_health" == "healthy" ]] || fail "$DEPLOY_COLOR app did not become healthy: $new_health"

# Direct health check via the virya-edge network
docker run --rm --network virya-edge curlimages/curl:8.12.0 \
  --fail --silent --show-error --connect-timeout 3 --max-time 10 \
  "http://${NEW_ALIAS}:8090/healthz/ready" >/dev/null

printf 'NEW_HEALTH=PASS\n'

# --- 3. Switch edge Caddy to new app ----------------------------------------

printf '\n==> 3/4 — Switch edge Caddy upstream to %s\n' "$DEPLOY_COLOR"
# Replace the current upstream alias with the new one
sed -i "s|reverse_proxy ${CURRENT_ALIAS}:8090|reverse_proxy ${NEW_ALIAS}:8090|g" "$EDGE_CADDYFILE"

# Verify the sed changed something
grep -Fq "reverse_proxy ${NEW_ALIAS}:8090" "$EDGE_CADDYFILE" || fail "Caddyfile was not updated to ${DEPLOY_COLOR} upstream"
grep -Fq "reverse_proxy ${CURRENT_ALIAS}:8090" "$EDGE_CADDYFILE" && fail "Caddyfile still contains old upstream — ambiguous state"

# Graceful Caddy reload
docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --force
CADDY_SWITCHED=true
printf 'CADDY_SWITCH=PASS upstream=%s\n' "$NEW_ALIAS"

# --- 4. Verify cross-system E2E + stop old app ------------------------------

printf '\n==> 4/4 — Verify cross-system E2E and finalize\n'

# Verify the tunnel is still healthy (it should be — we didn't touch it)
tunnel_health="$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
[[ "$tunnel_health" == "healthy" || "$tunnel_health" == "running" ]] || fail "tunnel is not healthy after cutover: $tunnel_health"

# E2E: operations summary through the new app
admin_token="$(docker inspect "$CURRENT_APP" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_ADMIN_TOKEN=//p')"
if [[ -n "$admin_token" ]]; then
  e2e_result="$(docker run --rm --network virya-edge curlimages/curl:8.12.0 \
    --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    -H "Authorization: Bearer $admin_token" \
    "http://${NEW_ALIAS}:8090/api/v1/tenants/virya/operations/summary" 2>/dev/null || true)"
  [[ -n "$e2e_result" ]] || fail "cross-system E2E gate failed: no response from new app"
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

# Stop the old app
docker stop "$CURRENT_APP" >/dev/null 2>&1 || true
docker rm "$CURRENT_APP" >/dev/null 2>&1 || true

# Update the image tag in .env
sed -i "s|^CONTROL_PLANE_IMAGE_TAG=.*|CONTROL_PLANE_IMAGE_TAG=sha-${TARGET}|" .env

# Clean up
rm -f "$CADDY_BACKUP"
trap - ERR INT TERM HUP

printf '\nCP_BLUEGREEN_DEPLOY=PASS sha=%s cutover=zero-downtime old=%s stopped new=%s active\n' "$TARGET" "$CURRENT_APP" "$NEW_APP"
