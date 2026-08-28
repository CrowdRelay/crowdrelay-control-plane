#!/usr/bin/env bash
# Starts the full local control plane stack — fully Dockerized, idempotent.
#
# Safe to re-run after deploys, reboots, or Docker daemon restarts.  It will:
#   1. Ensure .env exists with correct local-dev tokens + bootstrap admin.
#   2. Build the control plane API Docker image if stale.
#   3. Start control plane postgres + API (both with restart: unless-stopped).
#   4. Derive management + AREA tokens from the master keys and sync them
#      into the CrowdRelay .env so the two services can authenticate.
#   5. Restart CrowdRelay API+worker to pick up the derived keys.
#   6. Verify all dashboard endpoints return 200.
#
# Prerequisites:
#   - ../crowdrelay must be a checkout with a .env file (CrowdRelay local dev).
#   - Docker must be running.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
CROWDRELAY_DIR="${CROWDRELAY_DIR:-$(cd "$ROOT_DIR/../crowdrelay" 2>/dev/null && pwd -P || true)}"

log() { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
err() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; }

if [[ -z "$CROWDRELAY_DIR" || ! -f "$CROWDRELAY_DIR/.env" ]]; then
  err "CrowdRelay checkout not found at $CROWDRELAY_DIR/.env"
  err "Set CROWDRELAY_DIR or ensure ../crowdrelay exists with a .env file."
  exit 1
fi

cd "$ROOT_DIR"

# ── 1. Ensure .env ──────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  log "Generating .env for local development"
  ADMIN_TOKEN=$(openssl rand -hex 24)
  TELEMETRY_TOKEN=$(openssl rand -hex 24)
  PROVISIONER_TOKEN=$(openssl rand -hex 24)
  AREA_KEY=$(openssl rand -hex 32)
  MGMT_KEY=$(openssl rand -hex 32)
  BOOTSTRAP_PASSWORD=$(openssl rand -hex 16)
  cat > .env << EOF
DATABASE_URL=postgres://control_plane:control-plane-local@127.0.0.1:5435/control_plane
CONTROL_PLANE_BIND=127.0.0.1:8090
CONTROL_PLANE_ADMIN_TOKEN=$ADMIN_TOKEN
CONTROL_PLANE_TELEMETRY_TOKEN=$TELEMETRY_TOKEN
CONTROL_PLANE_PROVISIONER_TOKEN=$PROVISIONER_TOKEN
CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY=$AREA_KEY
CONTROL_PLANE_MANAGEMENT_MASTER_KEY=$MGMT_KEY
CONTROL_PLANE_ADMIN_ACTOR=wojciechbator
CONTROL_PLANE_TELEMETRY_ACTOR=runtime-reporter
CONTROL_PLANE_PROVISIONER_ACTOR=tenant-provisioner
CONTROL_PLANE_PROVISIONER_DEFAULT_IMAGE_TAG=sha-0123456789abcdef0123456789abcdef01234567
CONTROL_PLANE_PROVISIONER_API_IMAGE=ghcr.io/crowdrelay/crowdrelay-api
CONTROL_PLANE_PROVISIONER_WORKER_IMAGE=ghcr.io/crowdrelay/crowdrelay-worker
CONTROL_PLANE_PROVISIONER_LEASE_SECONDS=900
CONTROL_PLANE_RUNTIME_STALE_AFTER_SECONDS=180
CONTROL_PLANE_FRONTEND_DIST=frontend/dist
CONTROL_PLANE_BOOTSTRAP_ADMIN_USERNAME=admin
CONTROL_PLANE_BOOTSTRAP_ADMIN_PASSWORD=$BOOTSTRAP_PASSWORD
CONTROL_PLANE_VIRYA_CROWDRELAY_URL=http://host.docker.internal:8080
CONTROL_PLANE_VIRYA_SIGNAL_URL=https://signal.virya.music
CONTROL_PLANE_VIRYA_MANAGEMENT_URL=http://host.docker.internal:8080
RUST_LOG=info,tower_http=info
EOF
  chmod 600 .env
  log ".env created (bootstrap admin password: $BOOTSTRAP_PASSWORD)"
else
  log ".env already exists"
fi

# Source .env for token derivation
set -a; source .env; set +a

# ── 2. Build control plane API image if stale ───────────────────────────
# Rebuild if the image doesn't exist or if Dockerfile/Cargo.lock changed.
NEED_BUILD=false
if ! docker image inspect crowdrelay-control-plane-api:latest >/dev/null 2>&1; then
  NEED_BUILD=true
else
  # Compare Dockerfile + Cargo.lock hash against a cached hash from last build
  BUILD_HASH_FILE="/tmp/control-plane-build-hash"
  CURRENT_HASH=$(cat Dockerfile Cargo.lock 2>/dev/null | shasum -a 256 | awk '{print $1}')
  CACHED_HASH=$(cat "$BUILD_HASH_FILE" 2>/dev/null || echo "none")
  if [[ "$CURRENT_HASH" != "$CACHED_HASH" ]]; then
    NEED_BUILD=true
  fi
fi

if $NEED_BUILD; then
  log "Building control plane API Docker image"
  docker compose build api 2>&1 | tail -5
  cat Dockerfile Cargo.lock 2>/dev/null | shasum -a 256 | awk '{print $1}' > /tmp/control-plane-build-hash
else
  log "Control plane API image up to date"
fi

# ── 3. Start control plane postgres + API ───────────────────────────────
log "Starting control plane stack (postgres + API)"
docker compose up -d --wait 2>&1 | tail -5

# ── 4. Derive management tokens and sync to CrowdRelay ──────────────────
log "Deriving management tokens"

# Get the virya tenant_id from the control plane DB.
# The API's ensure_virya runs on startup, so the tenant exists after step 3.
TENANT_ID=$(docker exec crowdrelay-control-plane-postgres-1 \
  psql -U control_plane -d control_plane -t -c \
  "SELECT id FROM control_plane_tenants WHERE slug = 'virya';" 2>/dev/null | tr -d ' \n')

if [[ -z "$TENANT_ID" ]]; then
  err "Virya tenant not found — API may not have seeded it yet"
  docker logs crowdrelay-control-plane-api-1 2>&1 | tail -10
  exit 1
fi

log "Virya tenant_id: $TENANT_ID"

# Derive management token (HMAC-SHA256)
MGMT_KEY="$CONTROL_PLANE_MANAGEMENT_MASTER_KEY"
MGMT_TOKEN=$(printf "crowdrelay-control-plane-v1:%s" "$TENANT_ID" | \
  openssl dgst -sha256 -hmac "$MGMT_KEY" -hex 2>/dev/null | awk '{print $NF}')

# Derive AREA token (HMAC-SHA256)
AREA_KEY="$CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY"
AREA_TOKEN=$(printf "crowdrelay-area-admin-v1:%s" "$TENANT_ID" | \
  openssl dgst -sha256 -hmac "$AREA_KEY" -hex 2>/dev/null | awk '{print $NF}')

log "Management token: ${MGMT_TOKEN:0:16}..."
log "AREA token: ${AREA_TOKEN:0:16}..."

# Sync derived tokens into CrowdRelay .env
CR_ENV="$CROWDRELAY_DIR/.env"
if grep -q "^CROWDRELAY_CONTROL_PLANE_API_KEY=" "$CR_ENV"; then
  sed -i '' "s|^CROWDRELAY_CONTROL_PLANE_API_KEY=.*|CROWDRELAY_CONTROL_PLANE_API_KEY=$MGMT_TOKEN|" "$CR_ENV"
else
  echo "CROWDRELAY_CONTROL_PLANE_API_KEY=$MGMT_TOKEN" >> "$CR_ENV"
fi

if grep -q "^CROWDRELAY_CONTROL_PLANE_AREA_API_KEY=" "$CR_ENV"; then
  sed -i '' "s|^CROWDRELAY_CONTROL_PLANE_AREA_API_KEY=.*|CROWDRELAY_CONTROL_PLANE_AREA_API_KEY=$AREA_TOKEN|" "$CR_ENV"
else
  echo "CROWDRELAY_CONTROL_PLANE_AREA_API_KEY=$AREA_TOKEN" >> "$CR_ENV"
fi

log "CrowdRelay .env updated with derived tokens"

# ── 5. Restart CrowdRelay with new keys ─────────────────────────────────
log "Restarting CrowdRelay API+worker with derived tokens"
cd "$CROWDRELAY_DIR"
docker compose up -d --force-recreate api worker 2>&1 | tail -5
sleep 3
if curl -sf http://127.0.0.1:8080/v1/health/ready >/dev/null 2>&1; then
  log "CrowdRelay API healthy"
else
  err "CrowdRelay API not responding on :8080"
fi
cd "$ROOT_DIR"

# ── 5b. Start agents service in Docker (if crowdrelay-agents exists) ────
AGENTS_DIR="${AGENTS_DIR:-$(cd "$ROOT_DIR/../crowdrelay-agents" 2>/dev/null && pwd -P || true)}"
if [[ -n "$AGENTS_DIR" && -f "$AGENTS_DIR/package.json" ]]; then
  # Ensure agents .env exists with correct keys
  if [[ ! -f "$AGENTS_DIR/.env" ]]; then
    ENC_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || openssl rand -hex 32)
    cat > "$AGENTS_DIR/.env" << AGENTSEOF
AGENT_SERVICE_BIND=0.0.0.0:8095
DATABASE_URL=postgres://crowdrelay:crowdrelay-local-only@host.docker.internal:5432/crowdrelay
AGENT_SERVICE_AUTH_KEY=$CONTROL_PLANE_MANAGEMENT_MASTER_KEY
AGENT_SERVICE_ENCRYPTION_KEY=$ENC_KEY
AGENT_SERVICE_CORS_ORIGINS=http://127.0.0.1:8090
AGENT_SERVICE_OUTCOMES_ENABLED=true
AGENT_SERVICE_SCHEDULES_ENABLED=true
AGENTSEOF
    chmod 600 "$AGENTS_DIR/.env"
  fi

  # Ensure control plane .env points to the agents service
  if ! grep -q "^CONTROL_PLANE_AGENT_SERVICE_URL=" .env; then
    echo "CONTROL_PLANE_AGENT_SERVICE_URL=http://agent-service:8095" >> .env
  fi

  # Build + start the agents service as a Docker container (auto-restart)
  log "Starting agents service container on :8095"
  docker compose up -d --build --force-recreate agent-service 2>&1 | tail -5
  sleep 3
  if curl -sf http://127.0.0.1:8095/health >/dev/null 2>&1; then
    log "Agents service healthy on :8095"
  else
    err "Agents service not responding on :8095"
    docker logs crowdrelay-control-plane-agent-service-1 2>&1 | tail -10
  fi
fi

# ── 6. Verify dashboard endpoints ───────────────────────────────────────
log "Verifying dashboard endpoints"

# Login to get a session cookie
curl -sf -X POST http://127.0.0.1:8090/api/v1/auth/session \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${CONTROL_PLANE_BOOTSTRAP_ADMIN_USERNAME:-admin}\",\"password\":\"${CONTROL_PLANE_BOOTSTRAP_ADMIN_PASSWORD}\"}" \
  -c /tmp/cp-cookies-up.sh > /dev/null 2>&1

COOKIES="/tmp/cp-cookies-up.sh"
BASE="http://127.0.0.1:8090/api/v1"
endpoints=(
  "overview|/overview"
  "tenants|/tenants"
  "operations summary|/tenants/virya/operations/summary"
  "attention|/tenants/virya/operations/attention"
  "outbox|/tenants/virya/operations/outbox"
  "deliveries|/tenants/virya/operations/deliveries"
  "flags|/tenants/virya/operations/flags"
  "growth|/tenants/virya/operations/growth"
  "autopilot|/tenants/virya/operations/autopilot"
  "autopilot scorecard|/tenants/virya/operations/autopilot/scorecard"
  "reply triage|/tenants/virya/operations/autopilot/reply-triage"
  "signal overview|/tenants/virya/operations/signal-overview"
  "area overview|/tenants/virya/area"
  "area cities|/tenants/virya/area/cities"
  "area drops|/tenants/virya/area/drops"
  "runtime|/tenants/virya/runtime"
  "notifiers|/tenants/virya/notifiers"
  "audit|/tenants/virya/audit"
  "portfolio fanbases|/tenants/virya/portfolio/fanbases"
  "fanbase connections|/tenants/virya/portfolio/fanbases/connections"
  "automation events|/automation/events"
  "automation workflows|/automation/workflows"
  "agent templates|/tenants/virya/agents/templates"
  "agent tasks|/tenants/virya/agents/tasks"
  "agent providers|/tenants/virya/agents/providers"
  "agent models|/tenants/virya/agents/models"
  "agent credentials|/tenants/virya/agents/credentials"
  "agent suggestions|/tenants/virya/agents/suggestions"
  "agent schedules|/tenants/virya/agents/schedules"
)
PASS=0; FAIL=0
for entry in "${endpoints[@]}"; do
  label="${entry%%|*}"
  path="${entry##*|}"
  status=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES" "$BASE$path")
  if [[ "$status" == "200" || "$status" == "405" ]]; then
    printf '  \033[1;32m✓\033[0m %s (%s)\n' "$label" "$status"
    PASS=$((PASS+1))
  else
    printf '  \033[1;31m✗\033[0m %s (%s)\n' "$label" "$status"
    FAIL=$((FAIL+1))
  fi
done

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  log "All dashboard endpoints verified ($PASS passed)"
else
  err "$FAIL endpoint(s) failed ($PASS passed)"
fi

echo ""
log "Dashboard:  http://127.0.0.1:8090"
log "Login:      ${CONTROL_PLANE_BOOTSTRAP_ADMIN_USERNAME:-admin} / ${CONTROL_PLANE_BOOTSTRAP_ADMIN_PASSWORD}"
log "Logs:       docker logs -f crowdrelay-control-plane-api-1"
log "Stop:       just down"
