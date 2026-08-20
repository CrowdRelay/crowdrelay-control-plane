#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="${1:-}"
REMOTE="${CONTROL_PLANE_DEPLOY_HOST:-virya-home}"
REMOTE_DIR="${CONTROL_PLANE_DEPLOY_REMOTE_DIR:-/srv/crowdrelay-control-plane}"
REMOTE_TAR=""
REMOTE_AREA=""
REMOTE_CADDY=""
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
  remote_files=""
  for file in "$REMOTE_TAR" "$REMOTE_AREA" "$REMOTE_CADDY"; do
    [[ -z "$file" ]] || remote_files+=" '$file'"
  done
  if [[ -n "$remote_files" ]]; then
    ssh -T "$REMOTE" "rm -f $remote_files" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for command in git docker ssh scp; do require "$command"; done
cd "$ROOT_DIR"
docker info >/dev/null 2>&1 || fail 'Docker daemon is not available'

for file in deploy/compose.area.production.yml deploy/virya-area-tunnel.Caddyfile; do
  [[ -f "$file" && ! -L "$file" ]] || fail "missing canonical deploy file: $file"
done

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

printf '\n==> 2/4 — Transfer image + canonical tunnel config to Home\n'
LOCAL_TAR="$(mktemp -t crowdrelay-control-plane.XXXXXX.tar)"
REMOTE_TAR="/tmp/crowdrelay-control-plane-${TARGET}.tar"
REMOTE_AREA="/tmp/crowdrelay-control-plane-area-${TARGET}.yml"
REMOTE_CADDY="/tmp/crowdrelay-control-plane-caddy-${TARGET}.Caddyfile"
docker save -o "$LOCAL_TAR" "$REF"
scp -q "$LOCAL_TAR" "$REMOTE:$REMOTE_TAR"
scp -q deploy/compose.area.production.yml "$REMOTE:$REMOTE_AREA"
scp -q deploy/virya-area-tunnel.Caddyfile "$REMOTE:$REMOTE_CADDY"
printf 'DEPLOY_INPUTS_TRANSFER=PASS host=%s\n' "$REMOTE"

printf '\n==> 3/4 — Atomic app+tunnel deploy with rollback\n'
ssh -T "$REMOTE" sudo bash -s -- "$REMOTE_DIR" "$REMOTE_TAR" "$TARGET" "$REMOTE_AREA" "$REMOTE_CADDY" <<'REMOTE_DEPLOY'
set -Eeuo pipefail
umask 077

root="$1"
image_tar="$2"
target="$3"
area_source="$4"
caddy_source="$5"
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
  rm -f -- "$image_tar" "$area_source" "$caddy_source"
  exit 1
}

for command in docker python3 curl sha256sum grep cmp timeout; do
  command -v "$command" >/dev/null 2>&1 || fail "missing Home deploy command: $command"
done

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

install_canonical_infra() {
  install -m 0644 "$area_source" compose.area.yml
  install -m 0644 "$caddy_source" deploy/virya-area-tunnel.Caddyfile
}

restore_release_state() {
  [[ -n "$backup_dir" && -d "$backup_dir" ]] || return 1
  cp -p "$backup_dir/.env" .env
  chmod 600 .env
  install_canonical_infra
}

verify_tunnel_contract() {
  local app_id network_mode mount_source runtime_caddy route
  [[ "$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{.State.Status}}' 2>/dev/null || true)" == "running" ]] || return 1
  app_id="$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Id}}' 2>/dev/null || true)"
  network_mode="$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{.HostConfig.NetworkMode}}' 2>/dev/null || true)"
  [[ -n "$app_id" && "$network_mode" == "container:${app_id}" ]] || return 1
  mount_source="$(docker inspect crowdrelay-control-plane-virya-area-tunnel-1 --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
  [[ "$mount_source" == "$root/deploy/virya-area-tunnel.Caddyfile" ]] || return 1
  docker exec crowdrelay-control-plane-virya-area-tunnel-1 caddy validate --config /etc/caddy/Caddyfile >/dev/null || return 1
  cmp -s <(docker exec crowdrelay-control-plane-virya-area-tunnel-1 cat /etc/caddy/Caddyfile) "$caddy_source" || return 1
  runtime_caddy="$(docker exec crowdrelay-control-plane-virya-area-tunnel-1 cat /etc/caddy/Caddyfile)" || return 1
  for route in \
    '/v1/control-plane/area' \
    '/v1/control-plane/ops/summary' \
    '/v1/control-plane/ecosystem/flags' \
    '/v1/control-plane/autopilot/overview'; do
    grep -Fq "$route" <<<"$runtime_caddy" || return 1
  done
}

rollback() {
  local status="${1:-1}" rollback_health restored_image published
  trap - ERR
  if [[ "$mutated" == true ]]; then
    printf '\nROLLBACK=START old_tag=%s failed_tag=%s\n' "$old_tag" "$new_tag" >&2
    if restore_release_state && compose config --quiet; then
      compose up -d --no-deps --force-recreate app virya-area-tunnel || true
    fi
    rollback_health="$(wait_for_app || true)"
    restored_image="$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Config.Image}}' 2>/dev/null || true)"
    published="$(docker port crowdrelay-control-plane-app-1 8090/tcp 2>/dev/null | head -n1 || true)"
    if [[ "$restored_image" == "crowdrelay-control-plane:${old_tag}" \
      && ( "$rollback_health" == "healthy" || "$rollback_health" == "running" ) \
      && -n "$published" ]] \
      && verify_tunnel_contract \
      && curl -fsS --connect-timeout 3 --max-time 10 "http://${published}/healthz/ready" >/dev/null; then
      printf 'ROLLBACK=PASS restored_tag=%s health=%s canonical_infra=true\n' "$old_tag" "$rollback_health" >&2
    else
      printf 'ROLLBACK=DEGRADED expected_tag=%s image=%s health=%s canonical_infra=unknown\n' "$old_tag" "$restored_image" "$rollback_health" >&2
    fi
  fi
  [[ -z "$backup_dir" ]] || rm -rf -- "$backup_dir"
  rm -f -- "$image_tar" "$area_source" "$caddy_source"
  exit "$status"
}

trap 'rollback $?' ERR

for file in .env compose.production.yml compose.area.yml deploy/virya-area-tunnel.Caddyfile "$image_tar" "$area_source" "$caddy_source"; do
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
if url != "http://127.0.0.1:18080":
    raise SystemExit("effective app config has invalid CONTROL_PLANE_VIRYA_MANAGEMENT_URL")
' || fail 'effective compose management wiring is invalid'
printf 'MANAGEMENT_WIRING=PASS semantic=true\n'

caddy_image="$(python3 - "$area_source" <<'PY'
from pathlib import Path
import re
import sys
text = Path(sys.argv[1]).read_text()
matches = re.findall(r'^\s*image:\s*["\x27]?(caddy@sha256:[0-9a-f]{64})["\x27]?\s*$', text, flags=re.MULTILINE)
if len(matches) != 1:
    raise SystemExit(f"expected exactly one pinned Caddy image, found={len(matches)}")
print(matches[0])
PY
)" || fail 'canonical overlay does not contain exactly one pinned Caddy digest'
if ! docker image inspect "$caddy_image" >/dev/null 2>&1; then
  timeout 90s docker pull "$caddy_image" >/dev/null \
    || fail "unable to pull pinned Caddy image: $caddy_image"
fi
docker run --rm --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --tmpfs /data --tmpfs /config --tmpfs /tmp \
  -v "$caddy_source:/etc/caddy/Caddyfile:ro" \
  --entrypoint caddy \
  "$caddy_image" validate --config /etc/caddy/Caddyfile >/dev/null \
  || fail 'canonical tunnel Caddyfile validation failed'
printf 'CADDY_PREFLIGHT=PASS source=canonical image=pinned\n'

old_tag="$(sed -n 's/^CONTROL_PLANE_IMAGE_TAG=//p' .env | tail -n1)"
[[ "$old_tag" =~ ^sha-[0-9a-f]{40}$ ]] || fail "invalid current CONTROL_PLANE_IMAGE_TAG: $old_tag"
backup_dir="$(mktemp -d -p "$root" .predeploy.XXXXXX)"
cp -p .env "$backup_dir/.env"
chmod 700 "$backup_dir"
chmod 600 "$backup_dir/.env"

compose config --quiet

docker load -i "$image_tar" >/dev/null
ref="crowdrelay-control-plane:${new_tag}"
architecture="$(docker image inspect --format '{{.Architecture}}' "$ref")"
revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$ref")"
[[ "$architecture" == "amd64" ]] || fail "remote image architecture mismatch: $architecture"
[[ "$revision" == "$target" ]] || fail "remote OCI revision mismatch: got=$revision expected=$target"

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
compose up -d --no-deps --force-recreate app virya-area-tunnel

health="$(wait_for_app)"
[[ "$health" == "healthy" || "$health" == "running" ]] || fail "app failed to become healthy: $health"

runtime_image="$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Config.Image}}')"
[[ "$runtime_image" == "$ref" ]] || fail "runtime image mismatch: got=$runtime_image expected=$ref"
runtime_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$(docker inspect crowdrelay-control-plane-app-1 --format '{{.Image}}')")"
[[ "$runtime_revision" == "$target" ]] || fail "runtime OCI revision mismatch: $runtime_revision"

verify_tunnel_contract || fail 'live tunnel contract verification failed'
runtime_area_sha="$(sha256sum compose.area.yml | awk '{print $1}')"
source_area_sha="$(sha256sum "$area_source" | awk '{print $1}')"
[[ "$runtime_area_sha" == "$source_area_sha" ]] || fail 'runtime area compose differs from canonical source'

runtime_env="$(docker inspect crowdrelay-control-plane-app-1 --format '{{range .Config.Env}}{{println .}}{{end}}')"
area_master="$(printf '%s\n' "$runtime_env" | sed -n 's/^CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY=//p')"
management_master="$(printf '%s\n' "$runtime_env" | sed -n 's/^CONTROL_PLANE_MANAGEMENT_MASTER_KEY=//p')"
management_url="$(printf '%s\n' "$runtime_env" | sed -n 's/^CONTROL_PLANE_VIRYA_MANAGEMENT_URL=//p')"
[[ -n "$area_master" ]] || fail 'runtime AREA management master is missing'
[[ -n "$management_master" ]] || fail 'runtime operations management master is missing'
[[ "$management_url" == "http://127.0.0.1:18080" ]] || fail "unexpected management URL: $management_url"
unset runtime_env area_master management_master management_url

published="$(docker port crowdrelay-control-plane-app-1 8090/tcp | head -n1)"
[[ -n "$published" ]] || fail 'app has no published 8090/tcp endpoint'
base_url="http://${published}"
curl -fsS --connect-timeout 3 --max-time 10 "$base_url/healthz/ready" >/dev/null || fail 'Control Plane readiness failed'

admin="$(docker inspect crowdrelay-control-plane-app-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^CONTROL_PLANE_ADMIN_TOKEN=//p')"
[[ -n "$admin" ]] || fail 'CONTROL_PLANE_ADMIN_TOKEN missing from runtime'
summary=""
for attempt in $(seq 1 30); do
  if summary="$(curl -fsS --connect-timeout 3 --max-time 10 -H "Authorization: Bearer $admin" "$base_url/api/v1/tenants/virya/operations/summary" 2>/tmp/control-plane-operations-readiness-error)"; then
    printf 'OPERATIONS_READINESS=PASS attempt=%s\n' "$attempt"
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    detail="$(cat /tmp/control-plane-operations-readiness-error 2>/dev/null || true)"
    rm -f /tmp/control-plane-operations-readiness-error
    fail "operations management path did not become ready after bounded retry: $detail"
  fi
  sleep 1
done
rm -f /tmp/control-plane-operations-readiness-error
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
  /api/v1/tenants/virya/operations/autopilot; do
  code="$(curl -sS -o /tmp/control-plane-management-e2e-body -w '%{http_code}' --connect-timeout 3 --max-time 10 -H "Authorization: Bearer $admin" "$base_url$path")"
  if [[ "$code" != "200" ]]; then
    detail="$(cat /tmp/control-plane-management-e2e-body 2>/dev/null || true)"
    rm -f /tmp/control-plane-management-e2e-body
    fail "management E2E failed path=$path status=$code detail=$detail"
  fi
done
rm -f /tmp/control-plane-management-e2e-body
unset admin
printf 'MANAGEMENT_E2E=PASS area=200 summary=200 flags=200 autopilot=200\n'

rm -rf -- "$backup_dir"
backup_dir=""
rm -f -- "$image_tar" "$area_source" "$caddy_source"
mutated=false
trap - ERR
printf 'REMOTE_DEPLOY=PASS sha=%s app_tunnel_unit=true canonical_tunnel=true rollback=armed e2e=pass\n' "$target"
REMOTE_DEPLOY

REMOTE_TAR=""
REMOTE_AREA=""
REMOTE_CADDY=""
printf '\n==> 4/4 — Final receipt\n'
printf 'CONTROL_PLANE_DEPLOY=PASS sha=%s host=%s exact=true\n' "$TARGET"