#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo '==> static contracts'
python3 scripts/static-check.py
node scripts/check-web-source.mjs

echo '==> Rust formatting'
cargo fmt --all
cargo fmt --all -- --check

echo '==> Rust compile'
cargo check --workspace --all-targets

echo '==> Rust clippy'
cargo clippy --workspace --all-targets --all-features -- -D warnings

echo '==> Rust tests'
cargo test --workspace

echo '==> frontend dependencies'
cd frontend
if [[ -f package-lock.json ]]; then npm ci; else npm install --no-audit --no-fund; fi

echo '==> frontend source/type/build'
npm test
npm run typecheck
npm run build
npm run budget

echo 'CONTROL_PLANE_LOCAL_GATE=PASS'
