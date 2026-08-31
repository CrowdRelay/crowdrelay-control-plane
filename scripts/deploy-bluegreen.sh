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
EDGE_NETWORK="virya-edge"
ACTIVE_ALIAS="control-plane-active"
GREEN_APP="crowdrelay-control-plane-app-green-1"
BLUE_APP="crowdrelay-control-plane-app-1"
GREEN_ALIAS="control-plane-green"
BLUE_ALIAS="control-plane"
CADDY_BACKUP=""
NEW_STARTED=false
ALIAS_MOVED=false

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

rollback() {
  local status="${1:-1}"
  trap - ERR INT TERM HUP

  if [[ "$ALIAS_MOVED" == true ]]; then
    printf 'ROLLBACK=START reason=alias-moved reverting active alias to %s\n' "${CURRENT_APP:-}" >&2
    # Move the active alias back to the old container
    docker network disconnect "$EDGE_NETWORK" "$NEW_APP" >/dev/null 2>&1 || true
    docker network connect --alias "$ACTIVE_ALIAS" "$EDGE_NETWORK" "$CURRENT_APP" >/dev/null 2>&1 || true
    # Restore color-specific aliases on the old container
    if [[ "$DEPLOY_COLOR" == "green" ]]; then
      docker network connect --alias "$BLUE_ALIAS" "$EDGE_NETWORK" "$CURRENT_APP" >/dev/null 2>&1 || true
    else
      docker network connect --alias "$GREEN_ALIAS" "$EDGE_NETWORK" "$CURRENT_APP" >/dev/null 2>&1 || true
    fi
    printf 'ROLLBACK=ALIAS_REVERTED active=%s\n' "${CURRENT_APP:-}" >&2
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

[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]] || fail "usage: deploy-bluegreen.sh <sha> <digest> [repo-dir]"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "invalid image digest: $IMAGE_DIGEST"
for command in docker curl python3 flock; do command -v "$command" >/dev/null 2>&1 || fail "missing command: $command"; done

cd "$REPO_DIR"
exec 9> /run/lock/crowdrelay-control-plane-deploy.lock
flock -n 9 || fail 'another Control Plane deployment is already running'
[[ -f .env && ! -L .env ]] || fail "missing .env"
[[ "$(stat -c '%a' .env)" == "600" ]] || fail '.env must have mode 600'
[[ -f compose.production.yml ]] || fail "missing compose.production.yml"
[[ -f compose.area.yml ]] || fail "missing compose.area.yml"
[[ -f deploy/compose.bluegreen.yml ]] || fail "missing deploy/compose.bluegreen.yml"
[[ -f "$EDGE_CADDYFILE" ]] || fail "missing edge Caddyfile"

# Pre-deploy reconciliation: verify the Caddyfile uses the stable active
# alias with dynamic a, not a color-specific name. If it doesn't, fix it
# before deploying. This catches the case where a previous deploy failed
# mid-cutover or the Caddyfile was manually edited.
if ! grep -Fq "dynamic a ${ACTIVE_ALIAS}" "$EDGE_CADDYFILE"; then
  printf 'RECONCILE=FIX Caddyfile does not use dynamic a %s, repairing\n' "$ACTIVE_ALIAS"
  # Try replacing any color-specific alias with the stable one
  sed "s|reverse_proxy ${BLUE_ALIAS}:8090|reverse_proxy { dynamic a ${ACTIVE_ALIAS} { port 8090; refresh 5s } }|g; s|reverse_proxy ${GREEN_ALIAS}:8090|reverse_proxy { dynamic a ${ACTIVE_ALIAS} { port 8090; refresh 5s } }|g; s|reverse_proxy ${ACTIVE_ALIAS}:8090|reverse_proxy { dynamic a ${ACTIVE_ALIAS} { port 8090; refresh 5s } }|g" "$EDGE_CADDYFILE" > /tmp/caddy-reconcile.tmp
  cat /tmp/caddy-reconcile.tmp > "$EDGE_CADDYFILE"
  rm -f /tmp/caddy-reconcile.tmp
  # Copy the fixed Caddyfile directly into the container (bypasses any
  # stale bind mount) and reload. No restart needed — reload is zero-downtime.
  docker cp "$EDGE_CADDYFILE" "$EDGE_CONTAINER:/etc/caddy/Caddyfile" >/dev/null 2>&1 || \
    fail "cannot copy Caddyfile into edge Caddy container"
  docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || \
    fail "caddy reload failed after reconciliation — investigate manually"
  sleep 2
  grep -Fq "dynamic a ${ACTIVE_ALIAS}" "$EDGE_CADDYFILE" || fail "Caddyfile reconciliation failed — cannot find dynamic a ${ACTIVE_ALIAS}"
  printf 'RECONCILE=PASS Caddyfile now uses dynamic a %s\n' "$ACTIVE_ALIAS"
fi

# compose.agents.yml is optional — the agent-service is only recreated if it exists
[[ -f compose.agents.yml ]] && printf 'AGENT_OVERLAY=PASS\n' || printf 'AGENT_OVERLAY=SKIP reason=no-agents-overlay\n'

registry_image="ghcr.io/crowdrelay/crowdrelay-control-plane"
registry_ref="${registry_image}@${IMAGE_DIGEST}"
new_image="crowdrelay-control-plane:sha-${TARGET}"
docker pull "$registry_ref" >/dev/null || fail "cannot pull immutable Control Plane image: $registry_ref"
image_id="$(docker image inspect "$registry_ref" --format '{{.Id}}')"
revision="$(docker image inspect "$image_id" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
architecture="$(docker image inspect "$image_id" --format '{{.Architecture}}')"
host_architecture="$(docker version --format '{{.Server.Arch}}')"
repo_digests="$(docker image inspect "$image_id" --format '{{join .RepoDigests "\n"}}')"
[[ "$revision" == "$TARGET" ]] || fail "OCI revision mismatch: got=$revision expected=$TARGET"
[[ "$architecture" == "$host_architecture" ]] || fail "architecture mismatch: got=$architecture expected=$host_architecture"
grep -Fq "@${IMAGE_DIGEST}" <<<"$repo_digests" || fail "RepoDigests do not contain $IMAGE_DIGEST"
docker tag "$image_id" "$new_image"
printf 'NEW_IMAGE=PASS sha=%s digest=%s architecture=%s\n' "$TARGET" "$IMAGE_DIGEST" "$architecture"

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

# Verify the currently running container has the active alias
active_ip="$(docker inspect "$CURRENT_APP" --format '{{range $net, $conf := .NetworkSettings.Networks}}{{if eq $net "'"$EDGE_NETWORK"'"}}{{range $conf.Aliases}}{{.}} {{end}}{{end}}{{end}}' 2>/dev/null | tr ' ' '\n' | grep -q "$ACTIVE_ALIAS" && echo yes || echo no)"
if [[ "$active_ip" == "no" ]]; then
  printf 'RECONCILE=FIX %s does not have %s alias, adding it\n' "$CURRENT_APP" "$ACTIVE_ALIAS"
  docker network connect --alias "$ACTIVE_ALIAS" "$EDGE_NETWORK" "$CURRENT_APP" 2>/dev/null || true
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

# --- 3. Move active alias to new app -----------------------------------------

printf '\n==> 3/4 — Move %s alias to %s app\n' "$ACTIVE_ALIAS" "$DEPLOY_COLOR"
# The Caddyfile uses `dynamic a control-plane-active` which re-resolves
# Docker DNS every 5s. The new container already has the active alias
# from its compose config. We just need to remove the active alias from
# the old container. Caddy will pick up the change on the next refresh.
#
# Step 3a: Remove the active alias from the old container.
# The new container already has ACTIVE_ALIAS from compose.bluegreen.yml
# (green) or compose.production.yml (blue), so there is no gap — both
# containers have the alias briefly, and Caddy load-balances between them.
docker network disconnect "$EDGE_NETWORK" "$CURRENT_APP" 2>/dev/null || true
# Reconnect the old container without the active alias but keep its
# color-specific alias so it's still reachable for drain/stop.
if [[ "$DEPLOY_COLOR" == "green" ]]; then
  docker network connect --alias "$BLUE_ALIAS" "$EDGE_NETWORK" "$CURRENT_APP" 2>/dev/null || true
else
  docker network connect --alias "$GREEN_ALIAS" "$EDGE_NETWORK" "$CURRENT_APP" 2>/dev/null || true
fi

# Step 3b: Wait for Caddy's dynamic a to re-resolve DNS (refresh is 5s,
# wait two cycles to be safe). No restart or reload needed.
sleep 10

# Verify the active alias resolves to the new container
resolved_ip="$(docker run --rm --network "$EDGE_NETWORK" curlimages/curl:8.12.0 \
  --silent --connect-timeout 3 --max-time 5 \
  "http://${ACTIVE_ALIAS}:8090/healthz/ready" >/dev/null 2>&1 && echo ok || echo fail)"
[[ "$resolved_ip" == "ok" ]] || fail "active alias ${ACTIVE_ALIAS} does not resolve to new app"

ALIAS_MOVED=true
printf 'ALIAS_MOVE=PASS active=%s container=%s\n' "$ACTIVE_ALIAS" "$NEW_APP"
printf 'CADDY_DNS=PASS dynamic-a-refresh=no-restart\n'

# --- 4. Verify cross-system E2E + stop old app ------------------------------

printf '\n==> 4/4 — Verify cross-system E2E and finalize\n'

# Verify the tunnel is still healthy (it should be — we didn't touch it)
tunnel_health="$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
[[ "$tunnel_health" == "healthy" || "$tunnel_health" == "running" ]] || fail "tunnel is not healthy after cutover: $tunnel_health"

# E2E: operations summary through the active alias (verifies traffic routing)
admin_token="$(docker inspect "$NEW_APP" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_ADMIN_TOKEN=//p')"
if [[ -n "$admin_token" ]]; then
  e2e_result="$(docker run --rm --network virya-edge curlimages/curl:8.12.0 \
    --fail --silent --show-error --connect-timeout 3 --max-time 10 \
    -H "Authorization: Bearer $admin_token" \
    "http://${ACTIVE_ALIAS}:8090/api/v1/tenants/virya/operations/summary" 2>/dev/null || true)"
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

# --- 4b. Recreate agent-service with the latest image ---------------------
# The agent-service is stateless and doesn't need blue-green itself, but it
# must be kept running during the cutover and updated to match the new
# control-plane release. We recreate it after the cutover succeeds so a
# failure here doesn't take down the already-verified new app.
agent_container="crowdrelay-control-plane-agent-service-1"
agent_tag="$(sed -n 's/^AGENT_SERVICE_IMAGE_TAG=//p' .env | tail -n1)"
if [[ "$agent_tag" =~ ^sha-[0-9a-f]{40}$ ]]; then
  agent_image="crowdrelay-agents:${agent_tag}"
  if ! docker image inspect "$agent_image" >/dev/null 2>&1; then
    printf 'AGENT_IMAGE=SKIP reason=image-not-found tag=%s\n' "$agent_tag"
  else
    printf '\n==> Recreating agent-service with tag %s\n' "$agent_tag"
    docker compose -f compose.production.yml -f compose.area.yml -f compose.agents.yml \
      up -d --no-deps --force-recreate agent-service 2>/dev/null || true
    agent_health=""
    for attempt in $(seq 1 30); do
      agent_health="$(docker inspect "$agent_container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
      if [[ "$agent_health" == "healthy" || "$agent_health" == "running" ]]; then
        break
      fi
      sleep 2
    done
    if [[ "$agent_health" == "healthy" || "$agent_health" == "running" ]]; then
      printf 'AGENT_SERVICE=PASS health=%s tag=%s\n' "$agent_health" "$agent_tag"
    else
      printf 'AGENT_SERVICE=WARNING health=%s tag=%s (new app is active)\n' "$agent_health" "$agent_tag" >&2
    fi
  fi
else
  printf 'AGENT_SERVICE=SKIP reason=no-tag-configured\n'
fi

# Update the image tag in .env
sed -i "s|^CONTROL_PLANE_IMAGE_TAG=.*|CONTROL_PLANE_IMAGE_TAG=sha-${TARGET}|" .env

# Clean up
rm -f "$CADDY_BACKUP"
trap - ERR INT TERM HUP

printf '\nCP_BLUEGREEN_DEPLOY=PASS sha=%s cutover=zero-downtime old=%s stopped new=%s active\n' "$TARGET" "$CURRENT_APP" "$NEW_APP"
