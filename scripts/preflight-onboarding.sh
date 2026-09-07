#!/usr/bin/env bash
# Answers one question before a customer is on the phone: is this host ready to
# take another tenant, and if not, exactly what is missing.
#
# Creating a tenant in the console writes a row and queues a provisioning job.
# The provisioner then allocates a port, writes secrets, renders compose and
# brings up postgres + setup + api + worker, digest-pinned, bound to
# 127.0.0.1. Everything up to that point is automated and covered by contract
# tests.
#
# What is NOT automated is what this script exists to surface: the edge route,
# DNS, the state of the backups you are about to make somebody depend on, and
# whether the free capacity on this box can actually hold another stack. Those
# have to be checked before onboarding, not discovered during it.
#
# Read-only. It changes nothing and needs no credentials beyond reading the
# provisioner's own environment file.
#
#   sudo bash scripts/preflight-onboarding.sh                 # host readiness
#   sudo bash scripts/preflight-onboarding.sh api.band.example  # + that hostname
#
# Exit 0 when a tenant can be onboarded, 1 when something would block it.

set -uo pipefail

TENANT_HOSTNAME="${1:-}"
PROVISIONER_ENV="${PROVISIONER_ENV:-/etc/crowdrelay-provisioner.env}"
EDGE_CADDYFILE="${EDGE_CADDYFILE:-/opt/crowdrelay/ops/edge/Caddyfile}"
EDGE_CONTAINER="${EDGE_CONTAINER:-virya-edge-caddy}"
CONTROL_PLANE_ROOT="${CONTROL_PLANE_ROOT:-/srv/crowdrelay-control-plane}"
CONTROL_PLANE_BACKUPS="${CONTROL_PLANE_BACKUPS:-$CONTROL_PLANE_ROOT/backups}"
TENANT_DB_BACKUPS="${TENANT_DB_BACKUPS:-/srv/crowdrelay-db/backups}"
# A tenant stack is postgres + api + worker. Measured on the first tenant;
# raise it rather than discover the ceiling with a customer's data on the box.
REQUIRED_DISK_MB="${REQUIRED_DISK_MB:-4096}"
REQUIRED_MEM_MB="${REQUIRED_MEM_MB:-1024}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"

blocking=0
warnings=0

pass() { printf '  \033[32mok\033[0m      %s\n' "$*"; }
warn() { printf '  \033[33mwarn\033[0m    %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf '  \033[31mBLOCKED\033[0m %s\n' "$*"; blocking=$((blocking + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$*"; }

have() { command -v "$1" >/dev/null 2>&1; }

# ── The provisioner: the thing that turns a queued job into a running stack ──
section "Provisioner"

if systemctl is-active --quiet crowdrelay-provisioner.service 2>/dev/null; then
  pass "crowdrelay-provisioner.service is running"
else
  fail "crowdrelay-provisioner.service is not running — jobs will queue and never start"
fi

if [[ -r "$PROVISIONER_ENV" ]]; then
  # Read without sourcing. A value with a space or a comma in it — and there is
  # one on this host — turns `source` into command execution, which is exactly
  # how the control-plane backup died silently for nine days.
  read_env() { sed -n "s/^$1=//p" "$PROVISIONER_ENV" | head -n1 | tr -d "\"'"; }

  token="$(read_env CONTROL_PLANE_PROVISIONER_TOKEN)"
  [[ ${#token} -ge 32 ]] \
    && pass "provisioner token is set" \
    || fail "CONTROL_PLANE_PROVISIONER_TOKEN missing or under 32 characters"

  management="$(read_env CONTROL_PLANE_MANAGEMENT_MASTER_KEY)"
  area="$(read_env CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY)"
  telemetry="$(read_env CONTROL_PLANE_TELEMETRY_TOKEN)"
  if [[ -n "$management" && ( "$management" == "$token" || "$management" == "$area" || "$management" == "$telemetry" ) ]]; then
    fail "management master key equals another secret — the provisioner refuses to start like this"
  else
    pass "management, AREA, telemetry and provisioner secrets are distinct"
  fi

  region="$(read_env CONTROL_PLANE_PROVISIONER_DATA_REGION)"
  [[ -n "$region" ]] \
    && pass "data region is declared: $region" \
    || warn "CONTROL_PLANE_PROVISIONER_DATA_REGION is unset — this agent will refuse EU/US-pinned tenants"

  tenant_root="$(read_env CONTROL_PLANE_TENANT_ROOT)"
  tenant_root="${tenant_root:-/srv/crowdrelay-tenants}"
  if [[ -d "$tenant_root" ]]; then
    pass "tenant root exists: $tenant_root"
  else
    warn "tenant root $tenant_root does not exist yet — the provisioner creates it on the first tenant, so this is only a surprise if you expected one already"
  fi

  port_start="$(read_env CONTROL_PLANE_TENANT_PORT_START)"; port_start="${port_start:-18100}"
  port_end="$(read_env CONTROL_PLANE_TENANT_PORT_END)"; port_end="${port_end:-18999}"
  used=0
  if [[ -d "$tenant_root" ]]; then
    used="$(grep -rhoE '127\.0\.0\.1:[0-9]+:8080' "$tenant_root" 2>/dev/null | wc -l | tr -d ' ')"
  fi
  free=$(( port_end - port_start + 1 - used ))
  [[ $free -gt 0 ]] \
    && pass "tenant port pool $port_start-$port_end has $free free slots" \
    || fail "tenant port pool $port_start-$port_end is exhausted"
else
  fail "cannot read $PROVISIONER_ENV — run as root, or set PROVISIONER_ENV"
fi

# ── Capacity: a stack that cannot fit is a failed onboarding call ────────────
section "Capacity"

disk_mb="$(df -Pm "$CONTROL_PLANE_ROOT" 2>/dev/null | awk 'NR==2 {print $4}')"
if [[ -n "$disk_mb" ]]; then
  [[ "$disk_mb" -ge "$REQUIRED_DISK_MB" ]] \
    && pass "disk free: ${disk_mb} MB (need ${REQUIRED_DISK_MB} MB per tenant)" \
    || fail "disk free ${disk_mb} MB is under the ${REQUIRED_DISK_MB} MB a tenant stack needs"
fi

mem_mb="$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}')"
if [[ -n "$mem_mb" ]]; then
  [[ "$mem_mb" -ge "$REQUIRED_MEM_MB" ]] \
    && pass "memory available: ${mem_mb} MB (need ${REQUIRED_MEM_MB} MB per tenant)" \
    || fail "available memory ${mem_mb} MB is under the ${REQUIRED_MEM_MB} MB a tenant stack needs"
fi

# ── Backups: the promise the pricing page makes about their data ────────────
section "Backups"

newest_age_hours() {
  local dir="$1" newest
  newest="$(find "$dir" -maxdepth 1 -type f -name '*.sql.gz' -printf '%T@\n' 2>/dev/null | sort -nr | head -n1)"
  [[ -z "$newest" ]] && return 1
  printf '%d' "$(( ( $(date +%s) - ${newest%.*} ) / 3600 ))"
}

for pair in "control plane:$CONTROL_PLANE_BACKUPS" "tenant database:$TENANT_DB_BACKUPS"; do
  label="${pair%%:*}"; dir="${pair#*:}"
  if age="$(newest_age_hours "$dir")"; then
    if [[ "$age" -le "$BACKUP_MAX_AGE_HOURS" ]]; then
      pass "$label backup is ${age}h old"
    else
      fail "$label backup is ${age}h old — the job is failing, and onboarding a customer onto an unbacked database is the one mistake you cannot undo"
    fi
  else
    fail "$label has no backup in $dir"
  fi
done

# Both backup sets living on the same disk as the databases is not a backup.
if grep -rqiE 'rclone|restic|aws s3|b2 |scp ' "$CONTROL_PLANE_ROOT/deploy/backup-control-plane.sh" 2>/dev/null; then
  pass "control-plane backup copies off the host"
else
  warn "backups never leave this host — one disk failure loses the product and its backups together"
fi

# ── The edge: the step the console tells you to do by hand ──────────────────
section "Edge routing"

if [[ -r "$EDGE_CADDYFILE" ]]; then
  pass "edge Caddyfile is readable: $EDGE_CADDYFILE"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$EDGE_CONTAINER"; then
    pass "edge container $EDGE_CONTAINER is running"
    if docker exec "$EDGE_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
      pass "current edge config validates — a reload after adding a site will not take the edge down"
    else
      warn "edge config does not validate right now; fix that before adding a site block"
    fi
  else
    fail "edge container $EDGE_CONTAINER is not running — nothing will terminate TLS for the new tenant"
  fi
else
  fail "cannot read $EDGE_CADDYFILE — the tenant's public hostname cannot be routed"
fi

if [[ -n "$TENANT_HOSTNAME" ]]; then
  section "Hostname: $TENANT_HOSTNAME"

  if grep -qF "$TENANT_HOSTNAME" "$EDGE_CADDYFILE" 2>/dev/null; then
    pass "a site block for $TENANT_HOSTNAME already exists"
  else
    warn "no site block for $TENANT_HOSTNAME yet — the provisioner binds the tenant API to 127.0.0.1 only, so this has to be added and the edge reloaded before the URL answers"
  fi

  if have dig; then
    resolved="$(dig +short "$TENANT_HOSTNAME" A | tail -n1)"
    public_ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
    if [[ -z "$resolved" ]]; then
      fail "$TENANT_HOSTNAME does not resolve — Caddy cannot issue a certificate for a name with no A record"
    elif [[ -n "$public_ip" && "$resolved" != "$public_ip" ]]; then
      fail "$TENANT_HOSTNAME resolves to $resolved, this host is $public_ip — certificate issuance will fail"
    else
      pass "$TENANT_HOSTNAME resolves to this host ($resolved)"
    fi
  else
    warn "dig not installed — cannot verify DNS for $TENANT_HOSTNAME"
  fi
fi

# ── The services a tenant needs on day one ──────────────────────────────────
section "Dependent services"

if docker ps --format '{{.Names}}\t{{.Status}}' 2>/dev/null | grep -q 'control-plane-app.*healthy'; then
  pass "control plane API is healthy"
else
  fail "control plane API is not healthy — the console cannot create the tenant"
fi

if docker ps --format '{{.Names}}\t{{.Status}}' 2>/dev/null | grep -q 'agent-service.*healthy'; then
  pass "agent service is healthy"
  # A tenant with no reachable model gets an assistant that says it is busy.
  if docker exec crowdrelay-control-plane-agent-service-1 sh -lc '[ -n "$GROQ_API_KEY$GOOGLE_API_KEY$OPENCODE_ZEN_TOKEN" ]' 2>/dev/null; then
    pass "agent service has at least one platform model key"
  else
    warn "agent service has no platform model key — a new tenant has no AI until they connect their own provider"
  fi
else
  warn "agent service is not healthy — drafting and the assistant will be unavailable for the new tenant"
fi

if systemctl is-active --quiet crowdrelay-runtime-observer.service 2>/dev/null; then
  pass "runtime observer is running — the new tenant will report heartbeats"
else
  warn "runtime observer is not running — the tenant will show as 'not reporting' in the console"
fi

for unit in crowdrelay-production-smoke.service crowdrelay-control-plane-backup.service crowdrelay-db-backup.service; do
  state="$(systemctl show -p Result --value "$unit" 2>/dev/null)"
  if [[ "$state" == "success" || -z "$state" ]]; then
    pass "$unit last run: ${state:-unknown}"
  else
    fail "$unit last run: $state — fix this before it is a customer's problem"
  fi
done

# ── Verdict ─────────────────────────────────────────────────────────────────
printf '\n'
if [[ "$blocking" -gt 0 ]]; then
  printf 'ONBOARDING_PREFLIGHT=BLOCKED blocking=%d warnings=%d\n' "$blocking" "$warnings"
  exit 1
fi
printf 'ONBOARDING_PREFLIGHT=PASS warnings=%d\n' "$warnings"
