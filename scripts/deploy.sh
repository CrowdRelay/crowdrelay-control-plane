#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${1:-}"
WAIT_SECONDS="${CONTROL_PLANE_DEPLOY_WAIT_SECONDS:-3600}"
POLL_SECONDS="${CONTROL_PLANE_DEPLOY_POLL_SECONDS:-3}"
REMOTE="${CONTROL_PLANE_DEPLOY_HOST:-virya-home}"
CANONICAL="$ROOT_DIR/scripts/deploy-production.sh"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

for command in git gh ssh bash; do require "$command"; done
[[ "$WAIT_SECONDS" =~ ^[1-9][0-9]*$ ]] || fail 'CONTROL_PLANE_DEPLOY_WAIT_SECONDS must be a positive integer'
[[ "$POLL_SECONDS" =~ ^[1-9][0-9]*$ ]] || fail 'CONTROL_PLANE_DEPLOY_POLL_SECONDS must be a positive integer'

cd "$ROOT_DIR"
[[ -f "$CANONICAL" && ! -L "$CANONICAL" ]] || fail "canonical deploy is missing or unsafe: $CANONICAL"
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail 'local worktree must be clean'
branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
[[ "$branch" == "main" ]] || fail "make deploy must run from main, got=${branch:-detached}"

HEAD_SHA="$(git rev-parse HEAD)"
[[ -n "$TARGET" ]] || TARGET="$HEAD_SHA"
[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]] || fail 'target must be a full lowercase 40-character SHA'
[[ "$TARGET" == "$HEAD_SHA" ]] || fail "target must equal local HEAD: target=$TARGET head=$HEAD_SHA"
REMOTE_MAIN="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
[[ "$REMOTE_MAIN" == "$TARGET" ]] || fail "origin/main mismatch: remote=$REMOTE_MAIN local=$TARGET"
REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
[[ -n "$REPO" ]] || fail 'cannot resolve GitHub repository'

wait_for_ci() {
  local deadline run_id last_notice
  deadline=$((SECONDS + WAIT_SECONDS))
  run_id=""
  last_notice=0
  printf '==> Waiting for CI for %s\n' "$TARGET"
  while (( SECONDS < deadline )); do
    run_id="$(gh run list --repo "$REPO" --workflow "CI" --branch main --commit "$TARGET" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
    if [[ -n "$run_id" ]]; then
      printf 'CI_RUN=%s\n' "$run_id"
      gh run watch "$run_id" --repo "$REPO" --exit-status
      printf 'CI=PASS sha=%s\n' "$TARGET"
      return 0
    fi
    if (( SECONDS - last_notice >= 15 )); then
      printf '... still waiting for CI run for %s\n' "$TARGET"
      last_notice=$SECONDS
    fi
    sleep "$POLL_SECONDS"
  done
  fail "timed out waiting for CI for $TARGET"
}

verify_live_tunnel() {
  ssh -T "$REMOTE" sudo bash -s <<'REMOTE_GATE'
set -Eeuo pipefail
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
for command in docker curl python3 grep; do command -v "$command" >/dev/null 2>&1 || fail "missing tunnel gate command: $command"; done
app="crowdrelay-control-plane-app-1"
tunnel="crowdrelay-control-plane-virya-area-tunnel-1"
[[ "$(docker inspect "$app" --format '{{.State.Status}}' 2>/dev/null || true)" == "running" ]] || fail 'Control Plane app is not running'
[[ "$(docker inspect "$tunnel" --format '{{.State.Status}}' 2>/dev/null || true)" == "running" ]] || fail 'Control Plane tunnel is not running'
app_id="$(docker inspect "$app" --format '{{.Id}}')"
network_mode="$(docker inspect "$tunnel" --format '{{.HostConfig.NetworkMode}}')"
[[ "$network_mode" == "container:${app_id}" ]] || fail "Control Plane tunnel namespace drift: $network_mode"
docker exec "$tunnel" caddy validate --config /etc/caddy/Caddyfile >/dev/null || fail 'live tunnel Caddyfile is invalid'
runtime_caddy="$(docker exec "$tunnel" cat /etc/caddy/Caddyfile)" || fail 'cannot read live tunnel Caddyfile'
for route in '/v1/control-plane/area' '/v1/control-plane/ops/summary' '/v1/control-plane/ecosystem/flags' '/v1/control-plane/autopilot/overview'; do
  grep -Fq "$route" <<<"$runtime_caddy" || fail "live tunnel is missing route: $route"
done
runtime_env="$(docker inspect "$app" --format '{{range .Config.Env}}{{println .}}{{end}}')"
area_master="$(printf '%s\n' "$runtime_env" | sed -n 's/^CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY=//p')"
management_master="$(printf '%s\n' "$runtime_env" | sed -n 's/^CONTROL_PLANE_MANAGEMENT_MASTER_KEY=//p')"
management_url="$(printf '%s\n' "$runtime_env" | sed -n 's/^CONTROL_PLANE_VIRYA_MANAGEMENT_URL=//p')"
[[ -n "$area_master" ]] || fail 'Control Plane AREA management master is missing from runtime'
[[ -n "$management_master" ]] || fail 'Control Plane operations management master is missing from runtime'
[[ "$management_url" == "http://127.0.0.1:18080" ]] || fail "Control Plane management URL drifted: $management_url"
unset runtime_env area_master management_master management_url
published="$(docker port "$app" 8090/tcp | head -n1)"
[[ -n "$published" ]] || fail 'Control Plane app has no published endpoint'
admin="$(docker inspect "$app" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_ADMIN_TOKEN=//p')"
[[ -n "$admin" ]] || fail 'Control Plane admin token missing from runtime'
summary="$(curl -fsS --connect-timeout 3 --max-time 10 -H "Authorization: Bearer $admin" "http://${published}/api/v1/tenants/virya/operations/summary")"
unset admin
printf '%s' "$summary" | python3 -c '
import json
import sys
value = json.load(sys.stdin)
if not isinstance(value, dict):
    raise SystemExit("operations summary is not an object")
if not isinstance(value.get("schema_version"), int):
    raise SystemExit("schema_version missing")
http = value.get("http")
if not isinstance(http, dict) or not isinstance(http.get("p95_ms"), int):
    raise SystemExit("http.p95_ms missing")
print("CONTROL_PLANE_TUNNEL_GATE=PASS e2e=true p95_ms={}".format(http["p95_ms"]))
'
REMOTE_GATE
}

wait_for_ci
[[ "$(git rev-parse HEAD)" == "$TARGET" ]] || fail 'local HEAD moved while waiting for CI'
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail 'local worktree changed while waiting for CI'
REMOTE_MAIN="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
[[ "$REMOTE_MAIN" == "$TARGET" ]] || fail "origin/main moved while waiting: remote=$REMOTE_MAIN target=$TARGET"

set +e
bash "$CANONICAL" "$TARGET"
deploy_status=$?
set -e

verify_live_tunnel || fail 'Control Plane deploy/rollback left the tunnel unhealthy'
(( deploy_status == 0 )) || exit "$deploy_status"
printf 'MAKE_DEPLOY=PASS repo=crowdrelay-control-plane sha=%s tunnel=healthy\n' "$TARGET"
