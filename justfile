# Single source of truth for every gate. CI calls these same recipes
# (`taiki-e/install-action@just`), so local and CI can never drift again.
default:
    @just --list

# Static analysis + all Python contract gates + web source contracts.
static:
    python3 scripts/static-check.py
    python3 -m unittest discover -s scripts -p 'test_*.py'
    node scripts/check-web-source.mjs

# CrowdRelay cross-repo compatibility (needs ../crowdrelay checkout).
compat:
    python3 scripts/check_crowdrelay_compat.py ../crowdrelay

web-install:
    cd frontend && npm ci --no-audit --no-fund

web-test:
    cd frontend && npm test

web-build:
    cd frontend && npm run build && npm run budget

rust-fmt:
    cargo fmt --all -- --check

rust-check:
    cargo check --locked --workspace --all-targets

rust-clippy:
    cargo clippy --locked --workspace --all-targets --all-features -- -D warnings

rust-test:
    cargo test --locked --workspace

# Everything CI runs for a merge decision.
ci: static rust-fmt rust-clippy rust-test web-install web-test web-build

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
