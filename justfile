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
    for script in scripts/*.sh; do bash -n "$script"; done

# Everything CI runs for a merge decision.
ci: rust-fmt rust-clippy rust-test script-test web-install web-build

deploy:
    bash scripts/deploy.sh

deploy-production:
    bash scripts/deploy-production.sh

bootstrap-management:
    bash scripts/bootstrap-management.sh

# Public-edge login + contract probe against https://control.virya.music.
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

# Run Playwright tests with visible browser window.
test-headed:
    cd playwright && CONTROL_PLANE_BASE_URL=http://127.0.0.1:8090 CONTROL_PLANE_TEST_PASS="$(grep '^CONTROL_PLANE_BOOTSTRAP_ADMIN_PASSWORD=' ../.env | cut -d= -f2)" npx playwright test --grep @e2e --headed

# Run Playwright tests against production (needs CONTROL_PLANE_TEST_PASS env var).
test-prod:
    cd playwright && npx playwright test --grep @e2e
