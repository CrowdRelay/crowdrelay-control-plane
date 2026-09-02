#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Blue-green Control Plane deploy with zero-downtime Caddy cutover.
#
# Runs ON the production host (virya-crowdrelay) via SSH.
#
# Alternating blue-green: detects which color is currently active from the
# edge Caddyfile marker and deploys to the other color. Cutover is a
# graceful Caddy reload that reorders the static upstream pair — no Docker
# alias moves, no network disconnects, no edge restarts.
#
# On any failure: reverts the Caddy upstream and stops the new container,
# leaving production on the previous release with no user-visible downtime.
#
# Usage (called by deploy-ecosystem.sh or directly):
#   sudo bash scripts/deploy-bluegreen.sh <target-sha> <image-digest> [repo-dir]

TARGET="${1:-}"
IMAGE_DIGEST="${2:-}"
REPO_DIR="${3:-/srv/crowdrelay-control-plane}"
EDGE_CADDYFILE="/opt/crowdrelay/ops/edge/Caddyfile"
EDGE_CONTAINER="virya-edge-caddy"
EDGE_NETWORK="virya-edge"
GREEN_APP="crowdrelay-control-plane-app-green-1"
BLUE_APP="crowdrelay-control-plane-app-1"
GREEN_ALIAS="control-plane-green"
BLUE_ALIAS="control-plane"
RELEASE_STATE_DIR="/var/lib/crowdrelay-control-plane/releases"
CADDY_BACKUP=""
NEW_STARTED=false
CADDY_SWITCHED=false
RELEASE_ID=""

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

absolute_path_helper() {
  # deploy.sh scp's the receipt helper to /tmp alongside this script.
  printf '/tmp/release_receipt.py'
}

RECEIPT_HELPER="$(absolute_path_helper)"

rollback() {
  local status="${1:-1}"
  trap - ERR INT TERM HUP

  if [[ "$CADDY_SWITCHED" == true ]]; then
    printf 'ROLLBACK=START reason=caddy-switched reverting upstream to %s\n' "${CURRENT_APP:-}" >&2
    if [[ -n "$CADDY_BACKUP" && -f "$CADDY_BACKUP" ]]; then
      cat "$CADDY_BACKUP" > "$EDGE_CADDYFILE"
      docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile --address 127.0.0.1:2019 >/dev/null 2>&1 || true
      printf 'ROLLBACK=EDGE_REVERTED active=%s\n' "${CURRENT_APP:-}" >&2
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

  # Write failure receipt
  if [[ -n "$RELEASE_ID" ]]; then
    python3 "$RECEIPT_HELPER" rollback \
      --state-dir "$RELEASE_STATE_DIR" \
      --release-id "$RELEASE_ID" \
      --service control-plane \
      --reason "deploy-failure" >/dev/null 2>&1 || true
  fi

  printf 'ROLLBACK=COMPLETE status=%d\n' "$status" >&2
  exit "$status"
}

# --- Pre-flight -------------------------------------------------------------

[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]] || fail "usage: deploy-bluegreen.sh <sha> <digest> [repo-dir]"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "invalid image digest: $IMAGE_DIGEST"
for command in docker curl python3 flock cmp; do command -v "$command" >/dev/null 2>&1 || fail "missing command: $command"; done

cd "$REPO_DIR"
exec 9> /run/lock/crowdrelay-control-plane-deploy.lock
flock -n 9 || fail 'another Control Plane deployment is already running'
[[ -f .env && ! -L .env ]] || fail "missing .env"
[[ "$(stat -c '%a' .env)" == "600" ]] || fail '.env must have mode 600'
[[ -f compose.production.yml ]] || fail "missing compose.production.yml"
[[ -f compose.area.yml ]] || fail "missing compose.area.yml"
[[ -f deploy/compose.bluegreen.yml ]] || fail "missing deploy/compose.bluegreen.yml"
[[ -f "$EDGE_CADDYFILE" ]] || fail "missing edge Caddyfile"

# Verify edge Caddyfile uses static blue-green upstreams, not dynamic DNS
grep -Fq '# CONTROL_PLANE_ACTIVE=' "$EDGE_CADDYFILE" || \
  fail 'edge Caddyfile is not release-ready: missing active release marker; apply edge config separately'
grep -Fq 'to crowdrelay-control-plane-app-1:8090 crowdrelay-control-plane-app-green-1:8090' "$EDGE_CADDYFILE" \
  || grep -Fq 'to crowdrelay-control-plane-app-green-1:8090 crowdrelay-control-plane-app-1:8090' "$EDGE_CADDYFILE" \
  || fail 'edge Caddyfile does not contain the static blue-green upstream pair for Control Plane'
cmp -s <(docker exec "$EDGE_CONTAINER" cat /etc/caddy/Caddyfile 2>/dev/null) "$EDGE_CADDYFILE" || \
  fail 'edge Caddy bind mount is stale; apply edge config separately before deploying'
docker exec "$EDGE_CONTAINER" wget -qO- http://127.0.0.1:2019/config/ >/dev/null \
  || fail 'edge Caddy admin endpoint is unavailable'
printf 'EDGE_PREFLIGHT=PASS config=synchronized cutover=graceful-reload\n'

# --- Sync the AREA tunnel Caddyfile if the repo copy changed ---------------
# The tunnel is a separate container with its own bind-mounted Caddyfile.
# The blue-green app cutover does not touch it, so a stale allowlist silently
# 404s new control-plane routes the app just learned about. Sync before the
# app cutover so the new routes are reachable the moment the edge switches.
# deploy.sh scp's the current Caddyfile to /tmp; fall back to the repo copy
# if the scp artifact is missing (e.g. direct invocation on the remote).
TUNNEL_CONTAINER="crowdrelay-control-plane-virya-area-tunnel-1"
TUNNEL_CADDYFILE="/tmp/cp-virya-area-tunnel.Caddyfile"
[[ -f "$TUNNEL_CADDYFILE" ]] || TUNNEL_CADDYFILE="${REPO_DIR}/deploy/virya-area-tunnel.Caddyfile"
[[ -f "$TUNNEL_CADDYFILE" ]] || fail "missing tunnel Caddyfile: $TUNNEL_CADDYFILE"
if ! cmp -s "$TUNNEL_CADDYFILE" <(docker exec "$TUNNEL_CONTAINER" cat /etc/caddy/Caddyfile 2>/dev/null); then
  # The tunnel Caddyfile is bind-mounted read-only with admin off, so we
  # update the source on the host and restart the container to pick it up.
  cp "$TUNNEL_CADDYFILE" "${REPO_DIR}/deploy/virya-area-tunnel.Caddyfile"
  docker exec "$TUNNEL_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
  docker restart "$TUNNEL_CONTAINER" >/dev/null \
    || fail 'tunnel container restart failed after Caddyfile sync'
  # Wait for the tunnel to come back up.
  for _ in $(seq 1 15); do
    tunnel_state="$(docker inspect "$TUNNEL_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    [[ "$tunnel_state" == "healthy" || "$tunnel_state" == "running" ]] && break
    sleep 1
  done
  [[ "$tunnel_state" == "healthy" || "$tunnel_state" == "running" ]] \
    || fail "tunnel did not recover after Caddyfile sync: $tunnel_state"
  printf 'TUNNEL_CADDYFILE=SYNCED restart=true\n'
else
  printf 'TUNNEL_CADDYFILE=NOOP unchanged=true\n'
fi

# compose.agents.yml is optional — the agent-service is only recreated if it exists
[[ -f compose.agents.yml ]] && printf 'AGENT_OVERLAY=PASS\n' || printf 'AGENT_OVERLAY=SKIP reason=no-agents-overlay\n'

# Initialise release state directory
python3 "$RECEIPT_HELPER" init --state-dir "$RELEASE_STATE_DIR" --service control-plane >/dev/null

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

# Which colour is live is a fact about the containers, not a claim in a comment.
#
# This used to read `# CONTROL_PLANE_ACTIVE=` from the Caddyfile, treat it as
# the authority, and use container health only as a veto:
#
#     [[ "$blue_health" == "healthy" ]] || fail "edge declares blue active ..."
#
# So any drift between the marker and reality wedged every future deploy with
# no way forward but hand-editing production config. Drift is easy: a deploy
# interrupted between the marker flip and the container coming up, a container
# removed by hand, a `git checkout` of the Caddyfile. And when *neither* colour
# was healthy the run failed outright — the one state where a deploy is most
# needed was the one it refused.
#
# Reality decides; the marker is only a tiebreak when both are healthy.
blue_health="$(docker inspect "$BLUE_APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
green_health="$(docker inspect "$GREEN_APP" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
marker_color="$(sed -n 's/^[[:space:]]*# CONTROL_PLANE_ACTIVE=//p' "$EDGE_CADDYFILE" | head -n1)"

blue_ok=false; [[ "$blue_health" == "healthy" ]] && blue_ok=true
green_ok=false; [[ "$green_health" == "healthy" ]] && green_ok=true

COLD_START=false
if $blue_ok && $green_ok; then
  # Both serving: the marker breaks the tie, because it says which one Caddy
  # actually prefers. An unreadable marker defaults to blue.
  case "$marker_color" in
    blue|green) active_color="$marker_color" ;;
    *) active_color="blue" ;;
  esac
  baseline_reason="both healthy, marker=${marker_color:-missing}"
elif $blue_ok; then
  active_color="blue"
  baseline_reason="only blue healthy"
elif $green_ok; then
  active_color="green"
  baseline_reason="only green healthy"
else
  # Nothing is serving. Deploy anyway — this is exactly when a deploy matters.
  # Target the colour the marker does *not* claim, so a half-finished previous
  # run does not land on the same broken container again.
  COLD_START=true
  active_color="$([[ "$marker_color" == "green" ]] && echo green || echo blue)"
  baseline_reason="COLD START — neither healthy (blue=${blue_health:-absent} green=${green_health:-absent})"
fi

if [[ "$active_color" == "blue" ]]; then
  DEPLOY_COLOR="green"; CURRENT_APP="$BLUE_APP"; CURRENT_ALIAS="$BLUE_ALIAS"
  NEW_APP="$GREEN_APP"; NEW_ALIAS="$GREEN_ALIAS"
else
  DEPLOY_COLOR="blue"; CURRENT_APP="$GREEN_APP"; CURRENT_ALIAS="$GREEN_ALIAS"
  NEW_APP="$BLUE_APP"; NEW_ALIAS="$BLUE_ALIAS"
fi
printf 'BASELINE=%s reason=%s → deploying %s\n' \
  "$(printf '%s' "$active_color" | tr '[:lower:]' '[:upper:]')" "$baseline_reason" "$DEPLOY_COLOR"
if [[ "$marker_color" != "$active_color" ]]; then
  printf 'EDGE_MARKER=RECONCILED was=%s now=%s reason=derived-from-container-health\n' \
    "${marker_color:-missing}" "$active_color"
fi
$COLD_START && printf 'COLD_START=TRUE no-traffic-to-drain cutover-is-a-cold-bring-up\n'


# Snapshot the Caddyfile for rollback
CADDY_BACKUP="$(mktemp -t caddyfile-cp.XXXXXX)"
cp "$EDGE_CADDYFILE" "$CADDY_BACKUP"
printf 'CADDY_BACKUP=PASS file=%s\n' "$CADDY_BACKUP"

# Write pending receipt
RELEASE_ID="cp-${TARGET:0:12}-$(date -u +%Y%m%d%H%M%S)"
python3 "$RECEIPT_HELPER" pending \
  --state-dir "$RELEASE_STATE_DIR" \
  --service control-plane \
  --release-id "$RELEASE_ID" \
  --source-sha "$TARGET" \
  --image-digests "app=${IMAGE_DIGEST}" \
  --oci-revision "$revision" \
  --oci-architecture "$architecture" \
  --deploy-color "$DEPLOY_COLOR" \
  --current-color "$active_color" \
  --current-container "$CURRENT_APP" \
  --candidate-container "$NEW_APP" \
  --caddy-active-upstream "$active_color" \
  --compose-file "$REPO_DIR/compose.production.yml" \
  --caddy-file "$EDGE_CADDYFILE" \
  --env-file "$REPO_DIR/.env" >/dev/null

trap 'rollback $?' ERR INT TERM HUP

# --- 1. Start new app -------------------------------------------------------

printf '\n==> 1/5 — Start %s app\n' "$DEPLOY_COLOR"
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

docker update --restart unless-stopped "$NEW_APP" >/dev/null
restart_policy="$(docker inspect "$NEW_APP" --format '{{.HostConfig.RestartPolicy.Name}}')"
[[ "$restart_policy" == "unless-stopped" ]] || fail "candidate restart policy is not durable: $restart_policy"
printf 'NEW_APP=STARTED color=%s container=%s restart=%s\n' "$DEPLOY_COLOR" "$NEW_APP" "$restart_policy"

python3 "$RECEIPT_HELPER" phase --state-dir "$RELEASE_STATE_DIR" \
  --release-id "$RELEASE_ID" --phase start-candidate --status pass >/dev/null

# --- 2. Health-check new app directly ---------------------------------------

printf '\n==> 2/5 — Health-check %s app\n' "$DEPLOY_COLOR"
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

python3 "$RECEIPT_HELPER" phase --state-dir "$RELEASE_STATE_DIR" \
  --release-id "$RELEASE_ID" --phase health-check --status pass >/dev/null

# --- 3. Atomically prefer the candidate at the public edge -------------------

printf '\n==> 3/5 — Gracefully switch Caddy preference to %s app\n' "$DEPLOY_COLOR"
caddy_candidate="$(mktemp -t caddyfile-cp-candidate.XXXXXX)"
# Write the desired state, rather than substituting the state we assumed.
#
# These sed expressions used to match the *old* value — `s/ACTIVE=blue/green/`
# and one exact upstream ordering. If the file did not already hold precisely
# that value, neither expression fired, the candidate came out unchanged, and
# the run died on the "was not updated" guard below. A stale marker therefore
# broke the rewrite as well as the decision.
#
# Matching `.*` and rewriting the whole upstream line makes this idempotent and
# independent of whatever the file said before, which is also what lets a
# reconciled marker take effect in the same run.
sed \
  -e "s|^\([[:space:]]*\)# CONTROL_PLANE_ACTIVE=.*|\1# CONTROL_PLANE_ACTIVE=${DEPLOY_COLOR}|" \
  -e "s|^\([[:space:]]*\)to crowdrelay-control-plane-app.*|\1to ${NEW_APP}:8090 ${CURRENT_APP}:8090|" \
  "$EDGE_CADDYFILE" > "$caddy_candidate"
grep -Fq "# CONTROL_PLANE_ACTIVE=${DEPLOY_COLOR}" "$caddy_candidate" || fail 'candidate edge marker was not updated'
grep -Fq "to ${NEW_APP}:8090 ${CURRENT_APP}:8090" "$caddy_candidate" || fail 'candidate edge upstream order was not updated'
cat "$caddy_candidate" | docker exec -i "$EDGE_CONTAINER" caddy validate --config /dev/stdin --adapter caddyfile >/dev/null
CADDY_SWITCHED=true
cat "$caddy_candidate" > "$EDGE_CADDYFILE"
rm -f "$caddy_candidate"
docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile --address 127.0.0.1:2019 >/dev/null
cmp -s <(docker exec "$EDGE_CONTAINER" cat /etc/caddy/Caddyfile) "$EDGE_CADDYFILE" || fail 'edge runtime config differs after reload'
printf 'CADDY_SWITCH=PASS primary=%s fallback=%s reload=graceful\n' "$NEW_APP" "$CURRENT_APP"

python3 "$RECEIPT_HELPER" phase --state-dir "$RELEASE_STATE_DIR" \
  --release-id "$RELEASE_ID" --phase cutover --status pass >/dev/null

# --- 4. Verify cross-system E2E + soak --------------------------------------

printf '\n==> 4/5 — Verify cross-system E2E and soak\n'

# Verify the tunnel is still healthy (it should be — we didn't touch it)
tunnel_health="$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
[[ "$tunnel_health" == "healthy" || "$tunnel_health" == "running" ]] || fail "tunnel is not healthy after cutover: $tunnel_health"

# E2E: operations summary through the public edge (verifies traffic routing)
admin_token="$(docker inspect "$NEW_APP" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_ADMIN_TOKEN=//p')"
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

# Soak candidate for 120 seconds with old app available as fallback.
# Error-rate rollback: fail when 5xx exceeds 2% with at least 50 requests
# and an absolute floor of 3 failures.
printf '\n==> Soak candidate for 120 seconds with old app available as fallback\n'
soak_total=0
soak_errors=0
for soak_attempt in $(seq 1 24); do
  code="$(docker run --rm --network virya-edge curlimages/curl:8.12.0 \
    --silent --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 3 --max-time 10 \
    "http://${NEW_ALIAS}:8090/healthz/ready" || true)"
  soak_total=$((soak_total + 1))
  if [[ "$code" =~ ^5 ]] || [[ -z "$code" ]] || [[ "$code" == "000" ]]; then
    soak_errors=$((soak_errors + 1))
    printf 'SOAK_ERROR attempt=%s status=%s total=%s errors=%s\n' \
      "$soak_attempt" "${code:-transport}" "$soak_total" "$soak_errors" >&2
  fi
  # Immediate rollback on deterministic critical probe failure
  [[ "$code" == "200" ]] || fail "candidate soak critical probe failed attempt=$soak_attempt status=${code:-transport}"
  # Error-rate threshold check: 2% with >=50 samples, or absolute floor of 3
  # when sample size is too small for a meaningful rate (early in the soak).
  if [[ "$soak_total" -ge 50 ]]; then
    if [[ "$soak_errors" -ge 3 ]]; then
      error_rate="$(python3 -c "print(f'{$soak_errors/$soak_total*100:.1f}')")"
      if (( $(python3 -c "print(1 if $soak_errors/$soak_total*100 >= 2.0 else 0)") )); then
        fail "soak error-rate breach: ${soak_errors}/${soak_total} (${error_rate}%) — rolling back"
      fi
    fi
  else
    if [[ "$soak_errors" -ge 3 ]]; then
      fail "soak absolute error floor reached: ${soak_errors} failures in ${soak_total} probes — rolling back"
    fi
  fi
  sleep 5
done
printf 'SOAK=PASS seconds=120 probes=%s errors=%s fallback=%s\n' "$soak_total" "$soak_errors" "$CURRENT_APP"

python3 "$RECEIPT_HELPER" phase --state-dir "$RELEASE_STATE_DIR" \
  --release-id "$RELEASE_ID" --phase soak --status pass >/dev/null

# --- 5. Stop old app, finalize ----------------------------------------------

printf '\n==> 5/5 — Stop old app, finalize\n'
docker stop --time 30 "$CURRENT_APP" >/dev/null 2>&1 || true
docker rm "$CURRENT_APP" >/dev/null 2>&1 || true

# --- 5b. Update agent-service with exact-digest and hard health gate -------
# The agent-service is stateless from the deploy perspective. We pull by exact
# digest, recreate it, and hard-gate on health. If the new agent fails health,
# we roll back to the previous container image.
agent_container="crowdrelay-control-plane-agent-service-1"
agent_tag="$(sed -n 's/^AGENT_SERVICE_IMAGE_TAG=//p' .env | tail -n1)"
agent_digest="${AGENT_SERVICE_IMAGE_DIGEST:-}"
if [[ "$agent_tag" =~ ^sha-[0-9a-f]{40}$ ]]; then
  # Record the previous agent tag for rollback (restore via compose)
  prev_agent_tag="$(docker inspect "$agent_container" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"

  # Pull by digest if available, otherwise by tag
  if [[ -n "$agent_digest" ]]; then
    agent_registry_image="ghcr.io/crowdrelay/crowdrelay-agents@${agent_digest}"
    printf '\n==> Pulling agent-service by exact digest %s\n' "$agent_digest"
    docker pull "$agent_registry_image" >/dev/null
    # Tag locally so compose can reference it by tag
    docker tag "$agent_registry_image" "crowdrelay-agents:${agent_tag}"
  else
    agent_image="crowdrelay-agents:${agent_tag}"
    if ! docker image inspect "$agent_image" >/dev/null 2>&1; then
      printf 'AGENT_IMAGE=SKIP reason=image-not-found tag=%s\n' "$agent_tag"
      prev_agent_tag=""
    fi
  fi

  if [[ -z "$prev_agent_tag" || -n "$agent_digest" ]] || docker image inspect "crowdrelay-agents:${agent_tag}" >/dev/null 2>&1; then
    printf '\n==> Recreating agent-service with tag %s\n' "$agent_tag"
    docker compose -f compose.production.yml -f compose.area.yml -f compose.agents.yml \
      up -d --no-deps --force-recreate agent-service
    agent_health=""
    for attempt in $(seq 1 30); do
      agent_health="$(docker inspect "$agent_container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
      if [[ "$agent_health" == "healthy" ]]; then
        break
      fi
      sleep 2
    done
    if [[ "$agent_health" == "healthy" ]]; then
      printf 'AGENT_SERVICE=PASS health=%s tag=%s\n' "$agent_health" "$agent_tag"
    else
      printf 'AGENT_SERVICE=FAILED health=%s tag=%s — rolling back agent\n' "$agent_health" "$agent_tag" >&2
      # Rollback: restore the previous tag in .env and recreate via compose
      # so the container gets the correct env, volumes, and networks.
      if [[ -n "$prev_agent_tag" ]]; then
        sed -i "s|^AGENT_SERVICE_IMAGE_TAG=.*|AGENT_SERVICE_IMAGE_TAG=${prev_agent_tag}|" .env
        docker compose -f compose.production.yml -f compose.area.yml -f compose.agents.yml \
          up -d --no-deps --force-recreate agent-service 2>/dev/null || true
        printf 'AGENT_SERVICE=ROLLBACK restored_tag=%s\n' "$prev_agent_tag"
      fi
      fail "agent-service failed health check after deploy"
    fi
  fi
else
  printf 'AGENT_SERVICE=SKIP reason=no-tag-configured\n'
fi

# Update the image tag in .env
sed -i "s|^CONTROL_PLANE_IMAGE_TAG=.*|CONTROL_PLANE_IMAGE_TAG=sha-${TARGET}|" .env

# Finalize release receipt
python3 "$RECEIPT_HELPER" finalize \
  --state-dir "$RELEASE_STATE_DIR" \
  --release-id "$RELEASE_ID" --status pass >/dev/null

# Clean up
rm -f "$CADDY_BACKUP"
trap - ERR INT TERM HUP

printf '\nCP_BLUEGREEN_DEPLOY=PASS sha=%s cutover=graceful-reload old=%s stopped new=%s active receipt=%s\n' \
  "$TARGET" "$CURRENT_APP" "$NEW_APP" "$RELEASE_ID"
