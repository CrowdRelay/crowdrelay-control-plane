# Validation status

## Executed in this ChatGPT environment

- `python3 scripts/static-check.py` — PASS
- `node scripts/check-web-source.mjs` — PASS
- `git diff --check` — PASS
- workflow YAML parse — PASS
- Node syntax for local `.mjs` gate scripts — PASS
- archive integrity — performed before delivery

## Not executable in this sandbox

The sandbox has Node 22, but has no Rust/Cargo toolchain and outbound package-registry access is blocked. Therefore these remain mandatory local/CI gates rather than claimed PASS results:

- `cargo fmt --all -- --check`
- `cargo check --workspace --all-targets`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace`
- `npm install` / first lockfile generation
- `npm run typecheck`
- `npm run build`
- `npm run budget`

Run `./LOCAL_GATES.sh` on a networked development machine. Once `Cargo.lock` and `frontend/package-lock.json` are generated successfully, commit both lockfiles and switch all production/CI installs to locked mode (`--locked`, `npm ci`).
