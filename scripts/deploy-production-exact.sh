#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${1:-}"
IMAGE_DIGEST="${CONTROL_PLANE_IMAGE_DIGEST:-}"
REGISTRY_IMAGE="${CONTROL_PLANE_REGISTRY_IMAGE:-ghcr.io/crowdrelay/crowdrelay-control-plane}"
REMOTE="${CONTROL_PLANE_DEPLOY_HOST:-virya-crowdrelay}"
REMOTE_DIR="${CONTROL_PLANE_DEPLOY_REMOTE_DIR:-/srv/crowdrelay-control-plane}"
REMOTE_AREA=""

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

cleanup() {
  [[ -z "$REMOTE_AREA" ]] || ssh -T "$REMOTE" "rm -f '$REMOTE_AREA'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for command in git ssh scp; do require "$command"; done
cd "$ROOT_DIR"

for file in deploy/compose.area.production.yml; do
  [[ -f "$file" && ! -L "$file" ]] || fail "missing canonical deploy file: $file"
done

[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail 'local worktree must be clean'
branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
[[ "$branch" == "main" ]] || fail "production deploy must run from main, got=${branch:-detached}"

HEAD_SHA="$(git rev-parse HEAD)"
[[ -n "$TARGET" ]] || TARGET="$HEAD_SHA"
[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]] || fail 'target must be a full lowercase 40-character SHA'
[[ "$TARGET" == "$HEAD_SHA" ]] || fail "target must equal local HEAD: target=$TARGET head=$HEAD_SHA"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'CONTROL_PLANE_IMAGE_DIGEST must be an immutable sha256 digest from validated CI'
REMOTE_MAIN="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
[[ "$REMOTE_MAIN" == "$TARGET" ]] || fail "origin/main mismatch: remote=$REMOTE_MAIN local=$TARGET"

printf '==> 1/4 — Immutable CI release identity\n'
printf 'CI_RELEASE=PASS sha=%s digest=%s image=%s\n' "$TARGET" "$IMAGE_DIGEST" "$REGISTRY_IMAGE"

printf '\n==> 2/4 — Transfer canonical area config\n'
REMOTE_AREA="/tmp/crowdrelay-control-plane-area-${TARGET}.yml"
scp -q deploy/compose.area.production.yml "$REMOTE:$REMOTE_AREA"
printf 'DEPLOY_INPUTS_TRANSFER=PASS host=%s image-transfer=registry\n' "$REMOTE"

printf '\n==> 3/4 — Atomic app deploy with rollback\n'
ssh -T "$REMOTE" sudo bash -s -- \
  "$REMOTE_DIR" "$TARGET" "$IMAGE_DIGEST" "$REGISTRY_IMAGE" "$REMOTE_AREA" <<'REMOTE_DEPLOY'
set -Eeuo pipefail
umask 077

root="$1"
target="$2"
image_digest="$3"
registry_image="$4"
area_source="$5"
cd "$root"

mutated=false
backup_dir=""
old_tag=""
new_tag="sha-${target}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  if [[ "$mutated" == true ]]; then
    rollback 1
  fi
  [[ -z "$backup_dir" ]] || rm -rf -- "$backup_dir"
  rm -f -- "$area_source"
  exit 1
}

for command in docker python3 curl sha256sum grep cmp timeout; do
  command -v "$command" >/dev/null 2>&1 || fail "missing Home deploy command: $command"
done

compose() {
  local compose_files=(-f compose.production.yml -f compose.area.yml)
  if [[ -f compose.agents.yml ]]; then
    compose_files+=(-f compose.agents.yml)
  fi
  docker compose "${compose_files[@]}" "$@"
}

wait_for_app() {
  local health=""
  for _ in $(seq 1 60); do
    health="$(docker inspect crowdrelay-control-plane-app-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    if [[ "$health" == "healthy" || "$health" == "running" ]]; then
      printf '%s\n' "$health"
      return 0
    fi
    sleep 1
  done
  printf '%s\n' "$health"
  return 1
}

wait_for_agent_service() {
  local health=""
  for _ in $(seq 1 60); do
    health="$(docker inspect crowdrelay-control-plane-agent-service-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    if [[ "$health" == "healthy" || "$health" == "running" ]]; then
      printf '%s\n' "$health"
      return 0
    fi
    sleep 1
  done
  printf '%s\n' "$health"
  return 1
}

install_canonical_infra() {
  install -m 0644 "$area_source" compose.area.yml
}

restore_release_state() {
  [[ -n "$backup_dir" && -d "$backup_dir" ]] || return 1
  cp -p "$backup_dir/.env" .env
  chmod 600 .env
  install_canonical_infra
}

rollback() {
  local status="${1:-1}" rollback_health restored_image published
  trap - ERR
  if [[ "$mutated" == true ]]; then
    printf '\nROLLBACK=START old_tag=%s failed_tag=%s\n' "$old_tag" "$new_tag" >&2
    if restore_release_state && compose config --quiet; then
      compose up -d --no-deps --force-recreate app agent-service || true
    fi
    rollback_health="$(wait_for_app || true)"
    agent_health="$(wait_for_agent_service || true)"
    restored_image="$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Config.Image}}' 2>/dev/null || true)"
    published="$(docker port crowdrelay-control-plane-app-1 8090/tcp 2>/dev/null | head -n1 || true)"
    if [[ "$restored_image" == "crowdrelay-control-plane:${old_tag}" \
      && ( "$rollback_health" == "healthy" || "$rollback_health" == "running" ) \
      && -n "$published" ]] \
      && curl -fsS --connect-timeout 3 --max-time 10 "http://${published}/healthz/ready" >/dev/null; then
      printf 'ROLLBACK=PASS restored_tag=%s app=%s canonical_infra=true\n' "$old_tag" "$rollback_health" >&2
    else
      printf 'ROLLBACK=DEGRADED expected_tag=%s image=%s app=%s canonical_infra=unknown\n' "$old_tag" "$restored_image" "$rollback_health" >&2
    fi
  fi
  [[ -z "$backup_dir" ]] || rm -rf -- "$backup_dir"
  rm -f -- "$area_source"
  exit "$status"
}

trap 'rollback $?' ERR

for file in .env compose.production.yml compose.area.yml "$area_source"; do
  [[ -f "$file" && ! -L "$file" ]] || fail "missing or unsafe deploy file: $file"
done
[[ "$(stat -c '%a' .env)" == "600" ]] || fail '.env must have mode 600'

compose config --format json | python3 -c '
import json
import sys
model = json.load(sys.stdin)
app = model.get("services", {}).get("app", {})
env = app.get("environment") or {}
if isinstance(env, list):
    env = dict(item.split("=", 1) for item in env if isinstance(item, str) and "=" in item)
area_master = env.get("CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY")
master = env.get("CONTROL_PLANE_MANAGEMENT_MASTER_KEY")
url = env.get("CONTROL_PLANE_VIRYA_MANAGEMENT_URL")
if not isinstance(area_master, str) or not area_master:
    raise SystemExit("effective app config is missing CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY")
if not isinstance(master, str) or not master:
    raise SystemExit("effective app config is missing CONTROL_PLANE_MANAGEMENT_MASTER_KEY")
if area_master == master:
    raise SystemExit("effective management masters must be distinct")
if url != "http://crowdrelay-api-1:8080":
    raise SystemExit("effective app config has invalid CONTROL_PLANE_VIRYA_MANAGEMENT_URL")
' || fail 'effective compose management wiring is invalid'
printf 'MANAGEMENT_WIRING=PASS semantic=true\n'

old_tag="$(sed -n 's/^CONTROL_PLANE_IMAGE_TAG=//p' .env | tail -n1)"
[[ "$old_tag" =~ ^sha-[0-9a-f]{40}$ ]] || fail "invalid current CONTROL_PLANE_IMAGE_TAG: $old_tag"
backup_dir="$(mktemp -d -p "$root" .predeploy.XXXXXX)"
cp -p .env "$backup_dir/.env"
chmod 700 "$backup_dir"
chmod 600 "$backup_dir/.env"

compose config --quiet

registry_ref="${registry_image}@${image_digest}"
timeout 180s docker pull "$registry_ref" >/dev/null || fail "unable to pull immutable Control Plane image: $registry_ref"
image_id="$(docker image inspect "$registry_ref" --format '{{.Id}}')"
architecture="$(docker image inspect "$image_id" --format '{{.Architecture}}')"
revision="$(docker image inspect "$image_id" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
repo_digests="$(docker image inspect "$image_id" --format '{{join .RepoDigests "\n"}}')"
# The release tag is a multi-platform index, so the pull resolves to whatever
# the deploy host runs. Assert that it matches this host rather than one fixed
# architecture: amd64 on virya-oracle, arm64 on virya-crowdrelay.
host_architecture="$(docker version --format '{{.Server.Arch}}')"
[[ "$architecture" == "$host_architecture" ]] \
  || fail "remote image architecture mismatch: image=$architecture host=$host_architecture"
[[ "$revision" == "$target" ]] || fail "remote OCI revision mismatch: got=$revision expected=$target"
grep -Fq "@${image_digest}" <<<"$repo_digests" || fail "pulled image digest mismatch: expected=$image_digest"
ref="crowdrelay-control-plane:${new_tag}"
docker tag "$image_id" "$ref"
printf 'REGISTRY_IMAGE=PASS digest=%s revision=%s architecture=%s\n' "$image_digest" "$revision" "$architecture"

# Pull the agent service image if a tag is configured. The agent service is
# optional — if AGENT_SERVICE_IMAGE_TAG is unset, the service is skipped and
# the control plane runs without LLM worker dispatch.
agent_tag="$(sed -n 's/^AGENT_SERVICE_IMAGE_TAG=//p' .env | tail -n1)"
agent_digest="${AGENT_SERVICE_IMAGE_DIGEST:-}"
if [[ "$agent_tag" =~ ^sha-[0-9a-f]{40}$ ]]; then
  # Pull by digest if available (exact artifact), otherwise by tag.
  if [[ -n "$agent_digest" ]]; then
    agent_registry_ref="ghcr.io/crowdrelay/crowdrelay-agents@${agent_digest}"
  else
    agent_registry_ref="ghcr.io/crowdrelay/crowdrelay-agents:${agent_tag}"
  fi
  if ! docker image inspect "crowdrelay-agents:${agent_tag}" >/dev/null 2>&1; then
    timeout 180s docker pull "$agent_registry_ref" >/dev/null \
      || fail "unable to pull agent service image: $agent_registry_ref"
  fi
  agent_image_id="$(docker image inspect "$agent_registry_ref" --format '{{.Id}}')"
  agent_revision="$(docker image inspect "$agent_image_id" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  # The OCI revision label is the bare SHA. The tag is sha-<sha>. Accept either
  # the bare SHA or the sha- prefixed tag — both are the same commit.
  agent_revision_short="${agent_revision#sha-}"
  agent_tag_short="${agent_tag#sha-}"
  [[ "$agent_revision_short" == "$agent_tag_short" ]] \
    || fail "agent service OCI revision mismatch: got=$agent_revision expected=$agent_tag"
  docker tag "$agent_image_id" "crowdrelay-agents:${agent_tag}"
  printf 'AGENT_IMAGE=PASS tag=%s revision=%s digest=%s\n' "$agent_tag" "$agent_revision" "${agent_digest:-tag-pull}"
else
  printf 'AGENT_IMAGE=SKIP reason=no-tag-configured\n'
fi

mutated=true
install_canonical_infra
python3 - "$new_tag" <<'PY'
from pathlib import Path
import re
import sys
path = Path('.env')
new_tag = sys.argv[1]
text = path.read_text()
pattern = r'^CONTROL_PLANE_IMAGE_TAG=.*$'
if not re.search(pattern, text, flags=re.MULTILINE):
    raise SystemExit('CONTROL_PLANE_IMAGE_TAG missing')
text = re.sub(pattern, f'CONTROL_PLANE_IMAGE_TAG={new_tag}', text, count=1, flags=re.MULTILINE)
path.write_text(text)
PY
chmod 600 .env

compose config --quiet
compose up -d --no-deps --force-recreate app agent-service

health="$(wait_for_app)"
[[ "$health" == "healthy" || "$health" == "running" ]] || fail "app failed to become healthy: $health"
agent_health="$(wait_for_agent_service)"
[[ "$agent_health" == "healthy" || "$agent_health" == "running" ]] || fail "agent service failed to become healthy: $agent_health"

runtime_image="$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Config.Image}}')"
[[ "$runtime_image" == "$ref" ]] || fail "runtime image mismatch: got=$runtime_image expected=$ref"
runtime_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Image}}')")"
[[ "$runtime_revision" == "$target" ]] || fail "runtime OCI revision mismatch: $runtime_revision"

runtime_area_sha="$(sha256sum compose.area.yml | awk '{print $1}')"
source_area_sha="$(sha256sum "$area_source" | awk '{print $1}')"
[[ "$runtime_area_sha" == "$source_area_sha" ]] || fail 'runtime area compose differs from canonical source'

runtime_env="$(docker inspect crowdrelay-control-plane-app-1 --format '{{range .Config.Env}}{{println .}}{{end}}')"
area_master="$(printf '%s\n' "$runtime_env" | sed -n 's/^CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY=//p')"
management_master="$(printf '%s\n' "$runtime_env" | sed -n 's/^CONTROL_PLANE_MANAGEMENT_MASTER_KEY=//p')"
management_url="$(printf '%s\n' "$runtime_env" | sed -n 's/^CONTROL_PLANE_VIRYA_MANAGEMENT_URL=//p')"
[[ -n "$area_master" ]] || fail 'runtime AREA management master is missing'
[[ -n "$management_master" ]] || fail 'runtime operations management master is missing'
[[ "$area_master" != "$management_master" ]] || fail 'runtime management masters are not distinct'
[[ "$management_url" == "http://crowdrelay-api-1:8080" ]] || fail "unexpected management URL: $management_url"
unset runtime_env area_master management_master management_url

published="$(docker port crowdrelay-control-plane-app-1 8090/tcp | head -n1)"
[[ -n "$published" ]] || fail 'app has no published 8090/tcp endpoint'
base_url="http://${published}"
curl -fsS --connect-timeout 3 --max-time 10 "$base_url/healthz/ready" >/dev/null || fail 'Control Plane readiness failed'

admin="$(docker inspect crowdrelay-control-plane-app-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_ADMIN_TOKEN=//p')"
[[ -n "$admin" ]] || fail 'CONTROL_PLANE_ADMIN_TOKEN missing from runtime'
summary="$(curl -fsS --connect-timeout 3 --max-time 10 -H "Authorization: Bearer $admin" "$base_url/api/v1/tenants/virya/operations/summary")" \
  || fail 'operations management path is not ready after healthy app gate'
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
print("OPERATIONS_E2E=PASS schema={} p95_ms={}".format(value["schema_version"], http["p95_ms"]))
'

for path in \
  /api/v1/tenants/virya/area \
  /api/v1/tenants/virya/operations/flags \
  /api/v1/tenants/virya/operations/autopilot \
  /api/v1/tenants/virya/operations/attention; do
  code="$(curl -sS -o /tmp/control-plane-management-e2e-body -w '%{http_code}' --connect-timeout 3 --max-time 10 -H "Authorization: Bearer $admin" "$base_url$path")"
  if [[ "$code" != "200" ]]; then
    detail="$(cat /tmp/control-plane-management-e2e-body 2>/dev/null || true)"
    rm -f /tmp/control-plane-management-e2e-body
    fail "management E2E failed path=$path status=$code detail=$detail"
  fi
done
rm -f /tmp/control-plane-management-e2e-body
unset admin
printf 'MANAGEMENT_E2E=PASS area=200 summary=200 flags=200 autopilot=200 attention=200\n'

# Cross-service connectivity: verify the control plane can actually reach
# the CrowdRelay API at crowdrelay-api-1:8080 via crowdrelay-shared.
# This catches the 503 AllSectionsFailed issue where the API container
# is healthy but not on the crowdrelay-shared network.
cp_api_sha="$(docker exec crowdrelay-control-plane-app-1 \
  wget -qO- --timeout=5 http://crowdrelay-api-1:8080/v1/meta 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("gitSha",""))' 2>/dev/null || true)"
[[ -n "$cp_api_sha" ]] || \
  fail "control plane cannot reach CrowdRelay API at crowdrelay-api-1:8080 — API may not be on crowdrelay-shared network"
printf 'CROSS_SERVICE=PASS control_plane_reaches_api=true api_sha=%s\n' "$cp_api_sha"

rm -rf -- "$backup_dir"
backup_dir=""
rm -f -- "$area_source"
mutated=false
trap - ERR
printf 'REMOTE_DEPLOY=PASS sha=%s digest=%s app_agent_unit=true readiness=healthy rollback=armed e2e=pass\n' "$target" "$image_digest"
REMOTE_DEPLOY

REMOTE_AREA=""
printf '\n==> 4/4 — Final receipt\n'
printf 'CONTROL_PLANE_DEPLOY=PASS sha=%s digest=%s host=%s exact=true source=validated-ci-registry\n' "$TARGET" "$IMAGE_DIGEST" "$REMOTE"