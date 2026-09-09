#!/usr/bin/env bash
set -Eeuo pipefail

# Tenant onboarding: two modes.
#
# --prep-infra <hostname>
#   Readies the host for a new tenant. Runs preflight, ensures the provisioner
#   and runtime observer are running, verifies DNS. Leaves only the control
#   plane wizard as the remaining step.
#
# --full-auto --slug <slug> --name <name> --hostname <host> --region <PL|DE|CZ|US>
#   [--north-star <metric>] [--signal-enabled] [--synesthesia-enabled]
#   [--area-enabled] [--signal-url <url>] [--operator-username <name>]
#   [--operator-password <pass>] [--desired-version <sha>] [--dry-run]
#
#   Does everything end-to-end: preflight → create tenant via API → wait for
#   provisioning → add edge route → verify public health. One command.
#
# Both modes run ON the production host (virya-crowdrelay) or via SSH from the
# Mac. The full-auto mode needs sudo for the edge route step.
#
# Read-only with --dry-run: prints the plan, mutates nothing.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROVISIONER_ENV="${PROVISIONER_ENV:-/etc/crowdrelay-provisioner.env}"
TENANT_ROOT="${CONTROL_PLANE_TENANT_ROOT:-/srv/crowdrelay-tenants}"
CP_DIR="/srv/crowdrelay-control-plane"
CP_API="http://127.0.0.1:8090/api/v1"

MODE=""
DRY_RUN=false
HOSTNAME=""
SLUG=""
NAME=""
REGION=""
NORTH_STAR="total_audience"
SIGNAL_ENABLED=false
SYNESTHESIA_ENABLED=false
AREA_ENABLED=false
SIGNAL_URL=""
OP_USERNAME=""
OP_PASSWORD=""
DESIRED_VERSION=""

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
Usage:
  $0 --prep-infra <hostname> [--dry-run]
  $0 --full-auto --slug <slug> --name <name> --hostname <host> \\
     --region <PL|DE|CZ|US> [options] [--dry-run]

Full-auto options:
  --north-star <metric>        North star metric (default: total_audience)
  --signal-enabled             Enable Signal product
  --synesthesia-enabled        Enable Synesthesia product
  --area-enabled               Enable AREA management
  --signal-url <url>           Signal public site URL (requires --signal-enabled)
  --operator-username <name>   Initial operator username
  --operator-password <pass>   Initial operator password
  --desired-version <sha>      CrowdRelay release SHA (default: server default)
  --dry-run                    Print the plan, mutate nothing
USAGE
  exit 1
}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prep-infra) MODE="prep"; shift; HOSTNAME="${1:-}"; [[ -n "$HOSTNAME" ]] && shift || fail "--prep-infra requires a hostname" ;;
    --full-auto) MODE="full"; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --slug) SLUG="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --hostname) HOSTNAME="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --north-star) NORTH_STAR="$2"; shift 2 ;;
    --signal-enabled) SIGNAL_ENABLED=true; shift ;;
    --synesthesia-enabled) SYNESTHESIA_ENABLED=true; shift ;;
    --area-enabled) AREA_ENABLED=true; shift ;;
    --signal-url) SIGNAL_URL="$2"; shift 2 ;;
    --operator-username) OP_USERNAME="$2"; shift 2 ;;
    --operator-password) OP_PASSWORD="$2"; shift 2 ;;
    --desired-version) DESIRED_VERSION="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -n "$MODE" ]] || fail "must specify --prep-infra or --full-auto"
[[ -n "$HOSTNAME" ]] || fail "hostname is required"

if [[ "$MODE" == "full" ]]; then
  [[ -n "$SLUG" ]] || fail "--slug is required for --full-auto"
  [[ -n "$NAME" ]] || fail "--name is required for --full-auto"
  [[ -n "$REGION" ]] || fail "--region is required for --full-auto (PL|DE|CZ|US)"
fi

# --- Regional presets (mirror the wizard) ---
declare -A REGION_CC=( [PL]=PL [DE]=DE [CZ]=CZ [US]=US )
declare -A REGION_LOCALE=( [PL]=pl-PL [DE]=de-DE [CZ]=cs-CZ [US]=en-US )
declare -A REGION_TZ=( [PL]=Europe/Warsaw [DE]=Europe/Berlin [CZ]=Europe/Prague [US]="" )
declare -A REGION_CURRENCY=( [PL]=PLN [DE]=EUR [CZ]=CZK [US]=USD )
declare -A REGION_DATES=( [PL]=dmy [DE]=dmy [CZ]=dmy [US]=mdy )
declare -A REGION_NUMFMT=( [PL]=comma_decimal [DE]=comma_decimal [CZ]=comma_decimal [US]=dot_decimal )
declare -A REGION_DATA=( [PL]=eu [DE]=eu [CZ]=eu [US]=us )
declare -A REGION_AREA=( [PL]=eu [DE]=eu [CZ]=eu [US]=us )

read_cp_env() {
  sed -n "s/^$1=//p" "$CP_DIR/control-plane.env" 2>/dev/null | head -n1 | tr -d "\"'"
}

get_admin_token() {
  read_cp_env CONTROL_PLANE_ADMIN_TOKEN
}

# ── Preflight ────────────────────────────────────────────────────────────────
run_preflight() {
  local host="$1"
  printf '\n==> Preflight for %s\n' "$host"
  if $DRY_RUN; then
    printf '  [dry-run] would run: preflight-onboarding.sh %s\n' "$host"
    return 0
  fi
  bash "$ROOT_DIR/scripts/preflight-onboarding.sh" "$host"
}

# ── Ensure services ──────────────────────────────────────────────────────────
ensure_services() {
  printf '\n==> Ensuring provisioner and observer are running\n'
  if $DRY_RUN; then
    printf '  [dry-run] would check/start provisioner + observer\n'
    return 0
  fi
  for svc in crowdrelay-provisioner.service crowdrelay-runtime-observer.service; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
      printf '  ok      %s is running\n' "$svc"
    else
      systemctl start "$svc" 2>/dev/null || true
      if systemctl is-active --quiet "$svc" 2>/dev/null; then
        printf '  started %s\n' "$svc"
      else
        fail "$svc is not running and could not be started"
      fi
    fi
  done
}

# ── Create tenant via API ────────────────────────────────────────────────────
create_tenant() {
  local cc="${REGION_CC[$REGION]}"
  local locale="${REGION_LOCALE[$REGION]}"
  local tz="${REGION_TZ[$REGION]}"
  local currency="${REGION_CURRENCY[$REGION]}"
  local dates="${REGION_DATES[$REGION]}"
  local numfmt="${REGION_NUMFMT[$REGION]}"
  local data_region="${REGION_DATA[$REGION]}"
  local area_region="${REGION_AREA[$REGION]}"

  local signal_json="false"
  $SIGNAL_ENABLED && signal_json="true"
  local synesthesia_json="false"
  $SYNESTHESIA_ENABLED && synesthesia_json="true"
  local area_json="false"
  $AREA_ENABLED && area_json="true"

  local crowdrelay_url="https://$HOSTNAME"
  local signal_url_json="null"
  if $SIGNAL_ENABLED && [[ -n "$SIGNAL_URL" ]]; then
    signal_url_json="\"$SIGNAL_URL\""
  fi

  local desired_version_json="null"
  [[ -n "$DESIRED_VERSION" ]] && desired_version_json="\"$DESIRED_VERSION\""

  local operator_json="null"
  if [[ -n "$OP_USERNAME" && -n "$OP_PASSWORD" ]]; then
    operator_json="{\"username\":\"$OP_USERNAME\",\"password\":\"$OP_PASSWORD\"}"
  fi

  local body
  body=$(cat <<ENDJSON
{
  "slug": "$SLUG",
  "displayName": "$NAME",
  "crowdrelayBaseUrl": "$crowdrelay_url",
  "signalBaseUrl": $signal_url_json,
  "defaultCountryCode": "$cc",
  "regionalProfile": {
    "countryCode": "$cc",
    "region": "$area_region",
    "locale": "$locale",
    "timezone": "$tz",
    "currency": "$currency",
    "dateFormat": "$dates",
    "numberFormat": "$numfmt",
    "dataRegion": "$data_region"
  },
  "deployCrowdrelay": true,
  "desiredVersion": $desired_version_json,
  "signalEnabled": $signal_json,
  "synesthesiaEnabled": $synesthesia_json,
  "areaEnabled": $area_json,
  "northStarMetric": "$NORTH_STAR",
  "fanbaseSources": [],
  "initialOperator": $operator_json
}
ENDJSON
)

  printf '\n==> Creating tenant %s via control plane API\n' "$SLUG"
  if $DRY_RUN; then
    printf '  [dry-run] would POST /tenants with:\n  %s\n' "$(printf '%s' "$body" | python3 -m json.tool 2>/dev/null || echo "$body")"
    return 0
  fi

  local token
  token="$(get_admin_token)"
  [[ -n "$token" ]] || fail "cannot read CONTROL_PLANE_ADMIN_TOKEN"

  local response
  response="$(curl -fsS -X POST \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "$CP_API/tenants" 2>&1)" || fail "tenant creation failed: $response"

  printf '  created tenant %s\n' "$SLUG"
}

# ── Wait for provisioning to complete ─────────────────────────────────────────
wait_for_provisioning() {
  local slug="$1"
  local deadline=$((SECONDS + 600))  # 10 minutes
  local token
  token="$(get_admin_token)"

  printf '\n==> Waiting for provisioning of %s (timeout: 10 min)\n' "$slug"
  if $DRY_RUN; then
    printf '  [dry-run] would poll GET /tenants/%s/provisioning until completed\n' "$slug"
    return 0
  fi

  while (( SECONDS < deadline )); do
    local jobs
    jobs="$(curl -fsS -H "Authorization: Bearer $token" \
      "$CP_API/tenants/$slug/provisioning" 2>/dev/null || echo '{"items":[]}')"

    local phase
    phase="$(printf '%s' "$jobs" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('items', [])
if not items:
    print('none')
else:
    print(items[0].get('phase', 'unknown'))
" 2>/dev/null || echo "error")"

    case "$phase" in
      completed)
        printf '  PROVISIONING=PASS phase=completed\n'
        return 0
        ;;
      failed)
        fail "provisioning failed for $slug — check the provisioning jobs in the control plane"
        ;;
      running|accepted|queued)
        printf '  ... phase=%s\n' "$phase"
        sleep 5
        ;;
      none)
        printf '  ... no provisioning job found yet\n'
        sleep 5
        ;;
      *)
        printf '  ... phase=%s (unexpected)\n' "$phase"
        sleep 5
        ;;
    esac
  done
  fail "provisioning timed out for $slug after 10 minutes"
}

# ── Read the allocated port ──────────────────────────────────────────────────
read_tenant_port() {
  local slug="$1"
  local deployment_file="$TENANT_ROOT/$slug/deployment.json"

  if $DRY_RUN; then
    printf '  [dry-run] would read port from %s\n' "$deployment_file"
    echo "0"
    return 0
  fi

  [[ -f "$deployment_file" ]] || fail "deployment.json not found at $deployment_file — provisioning may not have written it"
  local port
  port="$(python3 -c "import json; print(json.load(open('$deployment_file')).get('apiPort', ''))" 2>/dev/null || echo "")"
  [[ "$port" =~ ^[0-9]+$ ]] || fail "cannot read apiPort from $deployment_file"
  printf '%s\n' "$port"
}

# ── Add edge route ───────────────────────────────────────────────────────────
add_edge_route() {
  local host="$1" port="$2"

  printf '\n==> Adding edge route for %s → 127.0.0.1:%s\n' "$host" "$port"
  if $DRY_RUN; then
    printf '  [dry-run] would run: add-tenant-edge-route.sh %s %s\n' "$host" "$port"
    return 0
  fi

  bash "$ROOT_DIR/scripts/add-tenant-edge-route.sh" "$host" "$port"
}

# ── Register with FakApp ────────────────────────────────────────────────────
# Adds a health-monitoring target for the new tenant to FakApp's config on
# virya-oracle. FakApp probes the tenant's public health endpoint and remediates
# (restart the tenant's containers) if it goes down.
FAKAP_HOST="${FAKAP_HOST:-virya-oracle}"
FAKAP_CONFIG="${FAKAP_CONFIG:-/etc/fakap/fakap.json}"

register_fakap_target() {
  local slug="$1" name="$2" host="$3"

  printf '\n==> Registering %s with FakApp\n' "$slug"
  if $DRY_RUN; then
    printf '  [dry-run] would add target tenant-%s to %s:%s\n' "$slug" "$FAKAP_HOST" "$FAKAP_CONFIG"
    return 0
  fi

  local compose_dir="$TENANT_ROOT/$slug"
  local restart_cmd="sudo docker restart crowdrelay-${slug}-api-1 crowdrelay-${slug}-worker-1"
  local compose_up_cmd="cd ${compose_dir} && sudo docker compose up -d"

  # SSH to virya-oracle, update the FakApp config with python3, restart the service.
  ssh -T "$FAKAP_HOST" "sudo python3 -c \"
import json
path = '${FAKAP_CONFIG}'
with open(path) as f:
    cfg = json.load(f)
tid = 'tenant-${slug}'
# Remove existing target with same id (idempotent)
cfg['targets'] = [t for t in cfg['targets'] if t.get('id') != tid]
cfg['targets'].append({
    'id': tid,
    'name': '${name} (${host})',
    'url': 'https://${host}/v1/health/ready',
    'failures_to_down': 3,
    'successes_to_up': 2,
    'repeat_alert_minutes': 30,
    'remediation': {
        'ssh_host': 'virya-crowdrelay',
        'max_attempts': 3,
        'cooldown_secs': 60,
        'settle_secs': 30,
        'check_deploy_cmd': 'sudo bash /usr/local/bin/crowdrelay-deploy-lock.sh status',
        'restart_cmd': '${restart_cmd}',
        'compose_up_cmd': '${compose_up_cmd}',
    },
})
with open(path, 'w') as f:
    json.dump(cfg, f, indent=2)
    f.write('\n')
print('FAKAP_TARGET=ADDED id=' + tid)
\"" || fail "failed to register FakApp target"

  ssh -T "$FAKAP_HOST" 'sudo systemctl restart fakap.service' 2>/dev/null || true
  printf '  FakApp now monitoring https://%s/v1/health/ready\n' "$host"
}

# ── Verify public health ─────────────────────────────────────────────────────
verify_health() {
  local host="$1"

  printf '\n==> Verifying public health at https://%s/v1/health/ready\n' "$host"
  if $DRY_RUN; then
    printf '  [dry-run] would curl https://%s/v1/health/ready\n' "$host"
    return 0
  fi

  local deadline=$((SECONDS + 60))
  while (( SECONDS < deadline )); do
    local status
    status="$(curl -o /dev/null -sw '%{http_code}' --max-time 10 "https://$host/v1/health/ready" 2>/dev/null || echo 000)"
    if [[ "$status" == "200" ]]; then
      printf '  HEALTH=PASS status=200\n'
      return 0
    fi
    printf '  ... status=%s (certificate issuance can take a few seconds)\n' "$status"
    sleep 5
  done
  fail "public health check failed for $host after 60s"
}

# ── Main ─────────────────────────────────────────────────────────────────────

if [[ "$MODE" == "prep" ]]; then
  printf '==> Infra prep for %s\n' "$HOSTNAME"
  run_preflight "$HOSTNAME"
  ensure_services
  printf '\n==> Infra ready. Open the control plane wizard and create the tenant.\n'
  printf '    URL: https://control.crowdrelay.music/tenants/new\n'
  printf 'ONBOARD_PREP=PASS hostname=%s\n' "$HOSTNAME"
  exit 0
fi

# Full-auto mode
printf '==> Full-auto onboarding for %s (%s) at %s\n' "$SLUG" "$NAME" "$HOSTNAME"
printf '    region=%s north-star=%s signal=%s synesthesia=%s area=%s\n' \
  "$REGION" "$NORTH_STAR" "$SIGNAL_ENABLED" "$SYNESTHESIA_ENABLED" "$AREA_ENABLED"

run_preflight "$HOSTNAME"
ensure_services
create_tenant
wait_for_provisioning "$SLUG"

PORT="$(read_tenant_port "$SLUG")"
printf '  PORT=%s\n' "$PORT"

add_edge_route "$HOSTNAME" "$PORT"
verify_health "$HOSTNAME"
register_fakap_target "$SLUG" "$NAME" "$HOSTNAME"

printf '\n==> Onboarding summary\n'
printf '  slug:      %s\n' "$SLUG"
printf '  name:      %s\n' "$NAME"
printf '  hostname:  %s\n' "$HOSTNAME"
printf '  port:      %s\n' "$PORT"
printf '  health:    https://%s/v1/health/ready\n' "$HOSTNAME"
printf '  fakap:     tenant-%s\n' "$SLUG"
printf '  console:   https://control.crowdrelay.music/tenants/%s\n' "$SLUG"
printf '\nONBOARD_AUTO=PASS slug=%s hostname=%s port=%s\n' "$SLUG" "$HOSTNAME" "$PORT"
