#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${1:-}"
REMOTE="${CONTROL_PLANE_DEPLOY_HOST:-virya-home}"
REMOTE_DIR="${CONTROL_PLANE_DEPLOY_REMOTE_DIR:-/srv/crowdrelay-control-plane}"
REMOTE_TAR=""
LOCAL_TAR=""

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

cleanup() {
  [[ -z "$LOCAL_TAR" ]] || rm -f -- "$LOCAL_TAR"
  if [[ -n "$REMOTE_TAR" ]]; then
    ssh -T "$REMOTE" "rm -f '$REMOTE_TAR'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for command in git docker ssh scp; do require "$command"; done
cd "$ROOT_DIR"
docker info >/dev/null 2>&1 || fail 'Docker daemon is not available'

[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || fail 'local worktree must be clean'
branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
[[ "$branch" == "main" ]] || fail "production deploy must run from main, got=${branch:-detached}"

HEAD_SHA="$(git rev-parse HEAD)"
if [[ -z "$TARGET" ]]; then
  TARGET="$HEAD_SHA"
fi
[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]] || fail 'target must be a full lowercase 40-character SHA'
[[ "$TARGET" == "$HEAD_SHA" ]] || fail "target must equal local HEAD: target=$TARGET head=$HEAD_SHA"

REMOTE_MAIN="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
[[ "$REMOTE_MAIN" == "$TARGET" ]] || fail "origin/main mismatch: remote=$REMOTE_MAIN local=$TARGET"

REF="crowdrelay-control-plane:sha-${TARGET}"
printf '==> 1/4 — Build exact linux/amd64 image\n'
docker buildx build \
  --platform linux/amd64 \
  --build-arg "VCS_REF=$TARGET" \
  --load \
  --tag "$REF" \
  .

architecture="$(docker image inspect --format '{{.Architecture}}' "$REF")"
revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$REF")"
[[ "$architecture" == "amd64" ]] || fail "local image architecture mismatch: $architecture"
[[ "$revision" == "$TARGET" ]] || fail "local OCI revision mismatch: got=$revision expected=$TARGET"
printf 'LOCAL_IMAGE=PASS sha=%s architecture=%s\n' "$TARGET" "$architecture"

printf '\n==> 2/4 — Transfer exact image to Home\n'
LOCAL_TAR="$(mktemp -t crowdrelay-control-plane.XXXXXX.tar)"
REMOTE_TAR="/tmp/crowdrelay-control-plane-${TARGET}.tar"
docker save -o "$LOCAL_TAR" "$REF"
scp -q "$LOCAL_TAR" "$REMOTE:$REMOTE_TAR"
printf 'IMAGE_TRANSFER=PASS host=%s\n' "$REMOTE"

printf '\n==> 3/4 — Atomic app+tunnel deploy with rollback\n'
ssh -T "$REMOTE" sudo bash -s -- "$REMOTE_DIR" "$REMOTE_TAR" "$TARGET" <<'REMOTE_DEPLOY'
set -Eeuo pipefail
umask 077

root="$1"
image_tar="$2"
target="$3"
cd "$root"

mutated=false
backup=""
old_tag=""
new_tag="sha-${target}"

compose() {
  docker compose -f compose.production.yml -f compose.area.yml "$@"
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

rollback() {
  local status="${1:-1}"
  trap - ERR
  if [[ "$mutated" == true && -n "$backup" && -f "$backup" ]]; then
    printf '\nROLLBACK=START old_tag=%s failed_tag=%s\n' "$old_tag" "$new_tag" >&2
    cp -p "$backup" .env
    chmod 600 .env
    compose config --quiet || true
    compose up -d --no-deps --force-recreate app virya-area-tunnel || true
    rollback_health="$(wait_for_app || true)"
    restored_image="$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Config.Image}}' 2>/dev/null || true)"
    if [[ "$restored_image" == "crowdrelay-control-plane:${old_tag}" && ( "$rollback_health" == "healthy" || "$rollback_health" == "running" ) ]]; then
      printf 'ROLLBACK=PASS restored_tag=%s health=%s\n' "$old_tag" "$rollback_health" >&2
    else
      printf 'ROLLBACK=DEGRADED expected_tag=%s image=%s health=%s\n' "$old_tag" "$restored_image" "$rollback_health" >&2
    fi
  fi
  [[ -z "$backup" ]] || rm -f -- "$backup"
  rm -f -- "$image_tar"
  exit "$status"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  if [[ "$mutated" == true ]]; then
    rollback 1
  fi
  [[ -z "$backup" ]] || rm -f -- "$backup"
  rm -f -- "$image_tar"
  exit 1
}

trap 'rollback $?' ERR

for file in .env compose.production.yml compose.area.yml deploy/virya-area-tunnel.Caddyfile; do
  [[ -f "$file" && ! -L "$file" ]] || fail "missing or unsafe runtime file: $file"
done
[[ "$(stat -c '%a' .env)" == "600" ]] || fail '.env must have mode 600'

old_tag="$(sed -n 's/^CONTROL_PLANE_IMAGE_TAG=//p' .env | tail -n1)"
[[ "$old_tag" =~ ^sha-[0-9a-f]{40}$ ]] || fail "invalid current CONTROL_PLANE_IMAGE_TAG: $old_tag"
backup="$(mktemp -p "$root" .env.predeploy.XXXXXX)"
cp -p .env "$backup"
chmod 600 "$backup"

compose config --quiet

docker load -i "$image_tar" >/dev/null
ref="crowdrelay-control-plane:${new_tag}"
architecture="$(docker image inspect --format '{{.Architecture}}' "$ref")"
revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$ref")"
[[ "$architecture" == "amd64" ]] || fail "remote image architecture mismatch: $architecture"
[[ "$revision" == "$target" ]] || fail "remote OCI revision mismatch: got=$revision expected=$target"

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
mutated=true

compose config --quiet
compose up -d --no-deps --force-recreate app virya-area-tunnel

health="$(wait_for_app)"
[[ "$health" == "healthy" || "$health" == "running" ]] || fail "app failed to become healthy: $health"

runtime_image="$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Config.Image}}')"
[[ "$runtime_image" == "$ref" ]] || fail "runtime image mismatch: got=$runtime_image expected=$ref"
runtime_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Image}}')")"
[[ "$runtime_revision" == "$target" ]] || fail "runtime OCI revision mismatch: $runtime_revision"

tunnel_status="$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{.State.Status}}')"
[[ "$tunnel_status" == "running" ]] || fail "tunnel is not running: $tunnel_status"
app_id="$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Id}}')"
network_mode="$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{.HostConfig.NetworkMode}}')"
[[ "$network_mode" == "container:${app_id}" ]] || fail "tunnel namespace mismatch: got=$network_mode expected=container:${app_id}"

mount_source="$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}')"
[[ "$mount_source" == "$root/deploy/virya-area-tunnel.Caddyfile" ]] || fail "tunnel Caddyfile mount drift: $mount_source"
docker exec crowdrelay-control-plane-virya-area-tunnel-1 caddy validate --config /etc/caddy/Caddyfile >/dev/null
docker exec crowdrelay-control-plane-virya-area-tunnel-1 cat /etc/caddy/Caddyfile | grep -Fq '/v1/control-plane/ops/summary' || fail 'live tunnel config is missing operations route'

management_url="$(docker inspect crowdrelay-control-plane-app-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_VIRYA_MANAGEMENT_URL=//p')"
[[ "$management_url" == "http://127.0.0.1:18080" ]] || fail "unexpected management URL: $management_url"

published="$(docker port crowdrelay-control-plane-app-1 8090/tcp | head -n1)"
[[ -n "$published" ]] || fail 'app has no published 8090/tcp endpoint'
base_url="http://${published}"
curl -fsS --connect-timeout 3 --max-time 10 "$base_url/healthz/ready" >/dev/null || fail 'Control Plane readiness failed'

admin="$(docker inspect crowdrelay-control-plane-app-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_ADMIN_TOKEN=//p')"
[[ -n "$admin" ]] || fail 'CONTROL_PLANE_ADMIN_TOKEN missing from runtime'
summary="$(curl -fsS --connect-timeout 3 --max-time 10 -H "Authorization: Bearer $admin" "$base_url/api/v1/tenants/virya/operations/summary")"
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

rm -f -- "$backup" "$image_tar"
backup=""
mutated=false
trap - ERR
printf 'REMOTE_DEPLOY=PASS sha=%s app_tunnel_unit=true rollback=armed e2e=pass\n' "$target"
REMOTE_DEPLOY

REMOTE_TAR=""
printf '\n==> 4/4 — Final receipt\n'
printf 'CONTROL_PLANE_DEPLOY=PASS sha=%s host=%s exact=true\n' "$TARGET" "$REMOTE"
