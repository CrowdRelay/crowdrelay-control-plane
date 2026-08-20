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

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

for file in .env compose.production.yml compose.area.yml deploy/virya-area-tunnel.Caddyfile; do
  [[ -f "$file" && ! -L "$file" ]] || fail "missing or unsafe runtime file: $file"
done
[[ "$(stat -c '%a' .env)" == "600" ]] || fail '.env must have mode 600'

old_tag="$(sed -n 's/^CONTROL_PLANE_IMAGE_TAG=//p' .env | tail -n1)"
[[ -n "$old_tag" ]] || fail 'CONTROL_PLANE_IMAGE_TAG is missing from .env'
new_tag="sha-${target}"
backup="$(mktemp -p "$root" .env.predeploy.XXXXXX)"
cp -p .env "$backup"
mutated=false

compose() {
  docker compose -f compose.production.yml -f compose.area.yml "$@"
}

rollback() {
  status=$?
  trap - ERR
  if [[ "$mutated" == true ]]; then
    printf '\nROLLBACK=START old_tag=%s failed_tag=%s\n' "$old_tag" "$new_tag" >&2
    cp -p "$backup" .env
    compose config --quiet || true
    compose up -d --no-deps --force-recreate app virya-area-tunnel || true
    for _ in $(seq 1 45); do
      health="$(docker inspect crowdrelay-control-plane-app-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
      [[ "$health" == "healthy" || "$health" == "running" ]] && break
      sleep 1
    done
    printf 'ROLLBACK=DONE restored_tag=%s\n' "$old_tag" >&2
  fi
  rm -f -- "$backup" "$image_tar"
  exit "$status"
}
trap rollback ERR

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

for _ in $(seq 1 60); do
  health="$(docker inspect crowdrelay-control-plane-app-1 --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
  [[ "$health" == "healthy" || "$health" == "running" ]] && break
  sleep 1
done
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

management_url="$(docker inspect crowdrelay-control-plane-app-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_VIRYA_MANAGEMENT_URL=//p')"
[[ "$management_url" == "http://127.0.0.1:18080" ]] || fail "unexpected management URL: $management_url"

admin="$(docker inspect crowdrelay-control-plane-app-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_ADMIN_TOKEN=//p')"
[[ -n "$admin" ]] || fail 'CONTROL_PLANE_ADMIN_TOKEN missing from runtime'
summary="$(curl -fsS --connect-timeout 3 --max-time 10 -H "Authorization: Bearer $admin" http://127.0.0.1:8090/api/v1/tenants/virya/operations/summary)"
printf '%s' "$summary" | python3 -c '
import json, sys
value = json.load(sys.stdin)
if not isinstance(value, dict):
    raise SystemExit("operations summary is not an object")
if not isinstance(value.get("schema_version"), int):
    raise SystemExit("schema_version missing")
http = value.get("http")
if not isinstance(http, dict) or not isinstance(http.get("p95_ms"), int):
    raise SystemExit("http.p95_ms missing")
print(f"OPERATIONS_E2E=PASS schema={value[chr(115)+chr(99)+chr(104)+chr(101)+chr(109)+chr(97)+chr(95)+chr(118)+chr(101)+chr(114)+chr(115)+chr(105)+chr(111)+chr(110)]} p95_ms={http[chr(112)+chr(57)+chr(53)+chr(95)+chr(109)+chr(115)]}")
'

rm -f -- "$backup" "$image_tar"
mutated=false
trap - ERR
printf 'REMOTE_DEPLOY=PASS sha=%s app_tunnel_unit=true rollback=armed e2e=pass\n' "$target"
REMOTE_DEPLOY

REMOTE_TAR=""
printf '\n==> 4/4 — Final receipt\n'
printf 'CONTROL_PLANE_DEPLOY=PASS sha=%s host=%s exact=true\n' "$TARGET" "$REMOTE"
