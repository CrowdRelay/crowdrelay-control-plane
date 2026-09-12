# Single source of truth for every gate. CI calls these same recipes
# (`taiki-e/install-action@just`), so local and CI can never drift again.
default:
    @just --list

web-install:
    cd frontend && npm ci --no-audit --no-fund

web-build:
    cd frontend && npm run build

rust-fmt:
    cargo fmt --all -- --check

rust-check:
    cargo check --locked --workspace --all-targets

rust-clippy:
    cargo clippy --locked --workspace --all-targets --all-features -- -D warnings

rust-test:
    cargo test --locked --workspace

script-test:
    python3 scripts/test_provisioner.py
    python3 scripts/test_runtime_observer.py
    python3 scripts/test_release_receipt.py
    python3 scripts/test_wizard_payload_contract.py
    python3 scripts/test_community_intelligence_contract.py
    python3 scripts/test_north_star_vocabulary_parity.py
    python3 scripts/test_mobile_apps_contract.py
    python3 scripts/test_tunnel_route_contract.py
    python3 scripts/test_deploy_bluegreen_preflight.py
    python3 scripts/test_blue_green_alias_contract.py
    for script in scripts/*.sh deploy/*.sh; do bash -n "$script"; done

# Everything CI runs for a merge decision.
ci: rust-fmt rust-clippy rust-test script-test web-install web-build

# Is this host ready to take another tenant, and if not, what is missing.
# Read-only; run it before an onboarding call, not during one.
preflight host="":
    ssh {{env_var_or_default("CONTROL_PLANE_DEPLOY_HOST", "virya-crowdrelay")}} \
        'sudo bash -s -- {{host}}' < scripts/preflight-onboarding.sh

# Publish a provisioned tenant at its public hostname. The provisioner binds
# the tenant API to 127.0.0.1 on purpose; this is the edge half.
edge-route host port:
    ssh {{env_var_or_default("CONTROL_PLANE_DEPLOY_HOST", "virya-crowdrelay")}} \
        'sudo bash -s -- {{host}} {{port}}' < scripts/add-tenant-edge-route.sh

# Prove a provisioned tenant works before the customer hears their URL.
verify-tenant slug host="":
    ssh {{env_var_or_default("CONTROL_PLANE_DEPLOY_HOST", "virya-crowdrelay")}} \
        'sudo bash -s -- {{slug}} {{host}}' < scripts/verify-tenant.sh

deploy:
    bash scripts/deploy.sh

deploy-production:
    bash scripts/deploy-production.sh

bootstrap-management:
    bash scripts/bootstrap-management.sh

# Prepare infra for a new tenant (leaves only the wizard to run).
onboard-prep hostname:
    ssh {{env_var_or_default("CONTROL_PLANE_DEPLOY_HOST", "virya-crowdrelay")}} \
        'sudo bash /srv/crowdrelay-control-plane/scripts/onboard-tenant.sh --prep-infra {{hostname}}'

# Full-auto: create tenant, provision, add edge route, verify — all from the Mac.
onboard-auto *ARGS:
    ssh {{env_var_or_default("CONTROL_PLANE_DEPLOY_HOST", "virya-crowdrelay")}} \
        'sudo bash /srv/crowdrelay-control-plane/scripts/onboard-tenant.sh --full-auto {{ARGS}}'

# Public-edge login + contract probe against https://control.crowdrelay.music.
# Needs CONTROL_PLANE_SMOKE_BASIC_AUTH=user:pass — see docs/EDGE-OPERATIONS.md.
smoke:
    bash scripts/production-smoke.sh

# ── Local development stack ──────────────────────────────────────────────
# Starts the full local stack: control plane postgres + API (Docker, auto-restart),
# CrowdRelay API+worker (Docker), derives management tokens, syncs them into
# the CrowdRelay .env, restarts CrowdRelay with the correct keys.
# One command, idempotent — safe to re-run after deploys, reboots, or Docker restarts.
up:
    bash scripts/up.sh

# Stops the local stack (control plane API + postgres + agent-service containers).
# CrowdRelay Docker containers are left running — use `cd ../crowdrelay && docker compose down` to stop those.
down:
    docker compose down

# Tail control plane API container logs.
logs:
    docker logs -f crowdrelay-control-plane-api-1

# Start Vite dev server for frontend hot-reload (run after `just up`).
dev:
    cd frontend && CONTROL_PLANE_ADMIN_TOKEN="$(grep '^CONTROL_PLANE_ADMIN_TOKEN=' ../.env | cut -d= -f2)" npm run dev

# Run Playwright E2E tests against the local stack (run after `just up`).
# Tests login, navigates all subpages, checks for 503s, red blocks, console errors.
# Bug report written to playwright/bug-report.json.
test:
    cd playwright && CONTROL_PLANE_BASE_URL=http://127.0.0.1:8090 CONTROL_PLANE_TEST_PASS="$(grep '^CONTROL_PLANE_BOOTSTRAP_ADMIN_PASSWORD=' ../.env | cut -d= -f2)" npx playwright test --grep @e2e

# Run the read-only account tests against the local stack (run after `just up`).
# Signs in as the seeded platform_viewer and asserts that every write control is
# disabled, that the palette drops its mutating commands, and that the server
# still refuses a write that reaches it anyway.
test-viewer:
    cd playwright && CONTROL_PLANE_BASE_URL=http://127.0.0.1:8090 CONTROL_PLANE_TEST_USER="$(grep '^CONTROL_PLANE_BOOTSTRAP_VIEWER_USERNAME=' ../.env | cut -d= -f2)" CONTROL_PLANE_TEST_PASS="$(grep '^CONTROL_PLANE_BOOTSTRAP_VIEWER_PASSWORD=' ../.env | cut -d= -f2)" npx playwright test --grep @viewer

# Run Playwright tests with visible browser window.
test-headed:
    cd playwright && CONTROL_PLANE_BASE_URL=http://127.0.0.1:8090 CONTROL_PLANE_TEST_PASS="$(grep '^CONTROL_PLANE_BOOTSTRAP_ADMIN_PASSWORD=' ../.env | cut -d= -f2)" npx playwright test --grep @e2e --headed

# Run Playwright tests against production (needs CONTROL_PLANE_TEST_PASS env var).
test-prod:
    cd playwright && npx playwright test --grep @e2e
