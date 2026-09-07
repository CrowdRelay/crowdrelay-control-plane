#!/usr/bin/env bash
# Proves a freshly provisioned tenant actually works, before the customer hears
# their URL.
#
# The provisioning job reports success when Compose came up and the readiness
# probes passed. That is a true statement about containers and a weaker one
# about the product: the workspace can be missing, migrations can be behind the
# console's expectations, the edge can be routing to the wrong port, the
# certificate can still be pending, and the runtime can be reporting nothing —
# each of which the console shows only as an absence, on a different page.
#
# This asks all of those questions in one pass, from the outside where possible
# and from the host where it is not.
#
#   sudo bash scripts/verify-tenant.sh <slug>
#   sudo bash scripts/verify-tenant.sh <slug> api.band.example
#   CONTROL_PLANE_TENANT_PROJECT=crowdrelay sudo -E bash scripts/verify-tenant.sh virya signal-api.virya.music
#
# Read-only. Exit 0 when the tenant is fit to hand over.
set -uo pipefail

SLUG="${1:-}"
PUBLIC_HOSTNAME="${2:-}"
# Tenants that predate the provisioner run under whatever Compose project they
# were deployed with, which is not derived from the slug. Naming it is better
# than a special case that guesses.
PROJECT_OVERRIDE="${CONTROL_PLANE_TENANT_PROJECT:-}"
TENANT_ROOT="${CONTROL_PLANE_TENANT_ROOT:-/srv/crowdrelay-tenants}"
CONTROL_PLANE_URL="${CONTROL_PLANE_URL:-https://control.crowdrelay.music}"
# The console's meta contract: a tenant behind this number is running
# migrations the control plane does not expect and will read as degraded.
MIN_SCHEMA_VERSION="${MIN_SCHEMA_VERSION:-45}"

[[ -n "$SLUG" ]] || { echo "usage: $0 <slug> [public-hostname]" >&2; exit 2; }
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "slug must be lowercase alphanumeric with hyphens" >&2; exit 2; }

blocking=0
warnings=0
pass() { printf '  \033[32mok\033[0m      %s\n' "$*"; }
warn() { printf '  \033[33mwarn\033[0m    %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf '  \033[31mBLOCKED\033[0m %s\n' "$*"; blocking=$((blocking + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$*"; }

project="${PROJECT_OVERRIDE:-crowdrelay-$SLUG}"
tenant_dir="$TENANT_ROOT/$SLUG"

section "Stack: $project"

managed=1
if [[ -d "$tenant_dir" ]]; then
  pass "provisioner-managed: $tenant_dir"
elif docker compose -p "$project" ps --quiet 2>/dev/null | grep -q .; then
  # The first tenant predates the provisioner and was deployed by hand. Saying
  # "the job never wrote its files" about a stack that is plainly running would
  # be wrong, and the checks below still apply to it.
  managed=0
  warn "no $tenant_dir — this tenant is running but was not deployed by the provisioner, so its port and secrets are wherever they were put by hand"
else
  fail "no $tenant_dir and no running Compose project $project. If this tenant predates the provisioner, name its project: CONTROL_PLANE_TENANT_PROJECT=<project> $0 $SLUG"
  printf '\nTENANT_VERIFY=BLOCKED slug=%s blocking=%d\n' "$SLUG" "$blocking"
  exit 1
fi

# The port is the one fact everything downstream depends on, and it is written
# once into the rendered compose file rather than stored anywhere queryable.
port="$(grep -oE '127\.0\.0\.1:[0-9]+:8080' "$tenant_dir/compose.yml" 2>/dev/null | head -n1 | cut -d: -f2)"
if [[ -z "$port" ]]; then
  # Fall back to whatever the running container actually publishes, which is
  # the only source of truth for a stack nobody rendered from a template.
  candidate="$(docker compose -p "$project" port api 8080 2>/dev/null | awk -F: '{print $NF}')"
  # `compose port` answers "invalid IP:0" for a service that publishes nothing,
  # and 0 is not a port anyone can connect to.
  [[ "$candidate" =~ ^[0-9]+$ ]] && (( candidate > 0 )) && port="$candidate"
fi
if [[ -n "$port" ]]; then
  pass "tenant API port: $port"
elif [[ "$managed" -eq 1 ]]; then
  fail "cannot read the API port out of $tenant_dir/compose.yml"
else
  warn "this stack publishes no host port — it is reached through the shared edge network rather than loopback, so the application checks below are skipped"
fi

for service in postgres api worker; do
  state="$(docker compose -p "$project" ps --format '{{.Service}}|{{.State}}|{{.Health}}' 2>/dev/null | awk -F'|' -v want="$service" '$1 == want {print $2 " " $3; exit}')"
  if [[ -z "$state" ]]; then
    fail "$service is not running under project $project"
  elif [[ "$state" == *unhealthy* ]]; then
    fail "$service is unhealthy: $state"
  elif [[ "$state" == *running* ]]; then
    pass "$service: ${state#* }"
  else
    warn "$service in an unexpected state: $state"
  fi
done

# `setup` runs once and exits. A non-zero exit is why a workspace goes missing.
setup_exit="$(docker inspect --format '{{.State.ExitCode}}' "${project}-setup-1" 2>/dev/null || echo unknown)"
case "$setup_exit" in
  0) pass "bootstrap (setup) completed cleanly" ;;
  unknown) warn "no setup container found — it may have been pruned, which is fine after a successful run" ;;
  *) fail "bootstrap (setup) exited $setup_exit — the workspace and seed data are probably incomplete" ;;
esac

section "Application"

if [[ -n "$port" ]]; then
  meta="$(curl -fsS --max-time 8 "http://127.0.0.1:${port}/v1/meta" 2>/dev/null)"
  if [[ -n "$meta" ]] && command -v jq >/dev/null 2>&1; then
    schema="$(jq -r '.schemaVersion // 0' <<<"$meta")"
    gitsha="$(jq -r '.gitSha // ""' <<<"$meta")"
    stamp="$(jq -r '.buildTimestamp // ""' <<<"$meta")"

    [[ "$schema" -ge "$MIN_SCHEMA_VERSION" ]] \
      && pass "schema version $schema" \
      || fail "schema version $schema is below the $MIN_SCHEMA_VERSION the console expects"

    [[ "$gitsha" =~ ^[0-9a-f]{40}$ ]] \
      && pass "running revision ${gitsha:0:8}" \
      || fail "the API reports no git revision — this image did not come from a validated build"

    # An image built outside CI carries a revision but no build timestamp,
    # which is the cheapest signal that something bypassed the release path.
    [[ -n "$stamp" ]] \
      && pass "build timestamp $stamp" \
      || fail "the API reports no build timestamp — this image was not built by CI, so its provenance is unverified"
  else
    fail "no /v1/meta from 127.0.0.1:${port} — the API is up but not answering the contract endpoint"
  fi

  curl -fsS --max-time 8 "http://127.0.0.1:${port}/v1/health/ready" >/dev/null 2>&1 \
    && pass "readiness probe answers" \
    || fail "readiness probe does not answer on 127.0.0.1:${port}"

  events="$(curl -o /dev/null -sw '%{http_code}' --max-time 8 "http://127.0.0.1:${port}/v1/public/events" 2>/dev/null)"
  [[ "$events" == "200" ]] \
    && pass "public events endpoint answers 200" \
    || warn "public events endpoint returned $events — fine for a tenant with no events yet, wrong if they expect a site"
fi

section "Edge"

if [[ -n "$PUBLIC_HOSTNAME" ]]; then
  status="$(curl -o /dev/null -sw '%{http_code}' --max-time 15 "https://${PUBLIC_HOSTNAME}/v1/health/ready" 2>/dev/null || echo 000)"
  case "$status" in
    200) pass "https://${PUBLIC_HOSTNAME}/v1/health/ready answers 200 — certificate valid, edge routed" ;;
    000) fail "https://${PUBLIC_HOSTNAME} did not answer — no route, no certificate, or DNS not pointing here" ;;
    502|503) fail "https://${PUBLIC_HOSTNAME} returned $status — the edge is routing to a port nothing is serving" ;;
    *) warn "https://${PUBLIC_HOSTNAME} returned $status" ;;
  esac
else
  warn "no public hostname given — pass one to prove the customer-facing URL works, not just the loopback"
fi

section "Control plane"

# The console decides a tenant is stale from its heartbeat, so a tenant that
# never reports looks broken to the operator no matter how healthy it is.
if command -v docker >/dev/null 2>&1; then
  # A query that errors is not a tenant that is missing, and reporting it as
  # one sends the reader looking in the wrong place.
  if ! observed="$(docker exec crowdrelay-control-plane-postgres-1 psql -U control_plane -d control_plane -Atc \
    "select coalesce(extract(epoch from now() - r.last_heartbeat_at)::int::text, 'never')
       from control_plane_tenants t
       left join control_plane_runtime_status r on r.tenant_id = t.id
      where t.slug = '$SLUG'" 2>&1)"; then
    warn "could not read the tenant row: ${observed:0:90}"
    observed=query_failed
  fi
  case "$observed" in
    query_failed) : ;;
    '') warn "no tenant row for $SLUG in the control plane — was it created through the console?" ;;
    never) warn "tenant has never sent a heartbeat — it will show as 'not reporting' until the runtime observer sees it" ;;
    *) [[ "$observed" -lt 900 ]] \
         && pass "heartbeat ${observed}s ago" \
         || warn "last heartbeat ${observed}s ago — the console treats this as stale" ;;
  esac
fi

printf '\n'
if [[ "$blocking" -gt 0 ]]; then
  printf 'TENANT_VERIFY=BLOCKED slug=%s blocking=%d warnings=%d\n' "$SLUG" "$blocking" "$warnings"
  exit 1
fi
printf 'TENANT_VERIFY=PASS slug=%s warnings=%d\n' "$SLUG" "$warnings"
