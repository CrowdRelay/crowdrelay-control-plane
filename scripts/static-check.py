from pathlib import Path
root = Path(__file__).resolve().parents[1]
checks = {
    "synesthesia_db_invariant": (root / "migrations/0001_control_plane.sql", "NOT synesthesia_enabled OR slug = 'virya'"),
    "admin_hash": (root / "crates/control-plane-api/src/config.rs", "Sha256::digest"),
    "separate_telemetry_secret": (root / "crates/control-plane-api/src/config.rs", "CONTROL_PLANE_TELEMETRY_TOKEN"),
    "constant_time_auth": (root / "crates/control-plane-api/src/auth.rs", ".ct_eq("),
    "admin_bearer_only": (root / "crates/control-plane-api/src/auth.rs", "require_bearer(request.headers(), state.admin_token_hash)"),
    "caddy_admin_injection": (root / "deploy/Caddyfile.control.virya.music.example", 'header_up Authorization "Bearer {$CONTROL_PLANE_ADMIN_TOKEN}"'),
    "telemetry_auth": (root / "crates/control-plane-api/src/auth.rs", "require_telemetry"),
    "virya_seed_inherit_branding": (root / "crates/control-plane-api/src/store.rs", "branding_palette, synesthesia_enabled)"),
    "provisioning_no_rce": (root / "crates/control-plane-api/src/store.rs", '"mode": "workspace_isolated_deployment"'),
    "workspace_unique": (root / "migrations/0001_control_plane.sql", "control_plane_tenant_workspace_uidx"),
    "provisioning_dedupe_db": (root / "migrations/0002_operational_hardening.sql", "control_plane_provisioning_one_active_uidx"),
    "provisioning_dedupe_app": (root / "crates/control-plane-api/src/store.rs", "ON CONFLICT (tenant_id) WHERE status IN ('planned', 'approved', 'running') DO NOTHING"),
    "palette_contrast": (root / "crates/control-plane-api/src/validation.rs", "WCAG AA 4.5:1"),
    "runtime_report": (root / "crates/control-plane-api/src/routes.rs", '"/tenants/{slug}/runtime"'),
    "runtime_freshness": (root / "crates/control-plane-api/src/model.rs", "RuntimeHealth::classify"),
    "runtime_meaningful_audit": (root / "crates/control-plane-api/src/store.rs", 'action: "tenant.runtime.changed"'),
    "runtime_validation": (root / "crates/control-plane-api/src/validation.rs", "lastHeartbeatAt cannot be more than 5 minutes in the future"),
    "bounded_pool_acquire": (root / "crates/control-plane-api/src/main.rs", ".acquire_timeout(Duration::from_secs(5))"),
    "bounded_db_statement": (root / "crates/control-plane-api/src/main.rs", "SET statement_timeout = '5s'"),
    "joined_tenant_runtime": (root / "crates/control-plane-api/src/store.rs", "LEFT JOIN control_plane_runtime_status"),
    "solid_query": (root / "frontend/src/main.tsx", "@tanstack/solid-query"),
    "solid_router": (root / "frontend/src/main.tsx", "@tanstack/solid-router"),
    "docker_lockfile": (root / "Dockerfile", "COPY frontend/package.json frontend/package-lock.json ./"),
    "rust_1971_docker": (root / "Dockerfile", "FROM rust:1.97.1-alpine AS rust"),
    "rust_1971_ci": (root / ".github/workflows/ci.yml", "toolchain: 1.97.1"),
    "docker_cargo_locked": (root / "Dockerfile", "cargo build --release --locked"),
    "ci_cargo_locked": (root / ".github/workflows/ci.yml", "cargo check --locked"),
}
for name, (file, needle) in checks.items():
    text = file.read_text()
    assert needle in text, f"{name} missing in {file}"

store = (root / "crates/control-plane-api/src/store.rs").read_text()
assert 'action: "tenant.runtime.reported"' not in store, "heartbeat write amplification regression: every report is audited"
spa = (root / "frontend/src/lib/api.ts").read_text()
frontend = "\n".join(path.read_text() for path in (root / "frontend/src").rglob("*.ts*") if path.is_file())
auth = (root / "crates/control-plane-api/src/auth.rs").read_text()
caddy = (root / "deploy/Caddyfile.control.virya.music.example").read_text()
assert "x-control-plane-token" not in auth.lower(), "backend must not grow a browser-only admin header"
assert "x-control-plane-token" not in frontend.lower(), "SPA must not carry the platform admin secret"
assert "authorization" not in spa.lower(), "SPA must leave browser Basic Authorization untouched"
assert "CONTROL_PLANE_ADMIN_TOKEN" not in frontend, "admin secret must not be compiled into frontend source"
assert "crowdrelay-control-plane-token" not in frontend.lower(), "browser admin-token storage key must not return"
assert "{http.request.header.X-Control-Plane-Token}" not in caddy, "Caddy must not trust a browser-supplied app token"
assert caddy.index("handle @runtime") < caddy.index("basic_auth"), "telemetry route must bypass browser Basic and rely on its own Bearer"
assert caddy.index("basic_auth") < caddy.index('header_up Authorization "Bearer {$CONTROL_PLANE_ADMIN_TOKEN}"'), "Basic must gate server-side admin token injection"
workflow = (root / ".github/workflows/ci.yml").read_text()
for line in workflow.splitlines():
    if "uses:" in line:
        ref = line.split("@", 1)[-1].split()[0] if "@" in line else ""
        assert len(ref) == 40 and all(ch in "0123456789abcdef" for ch in ref), f"GitHub Action must be SHA-pinned: {line.strip()}"
print(f"CONTROL_PLANE_STATIC=PASS checks={len(checks)} auth=edge-basic+server-bearer freshness=bounded provisioning=idempotent")
