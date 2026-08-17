from pathlib import Path
root = Path(__file__).resolve().parents[1]
checks = {
    "synesthesia_db_invariant": (root / "migrations/0001_control_plane.sql", "NOT synesthesia_enabled OR slug = 'virya'"),
    "admin_hash": (root / "crates/control-plane-api/src/config.rs", "Sha256::digest"),
    "constant_time_auth": (root / "crates/control-plane-api/src/auth.rs", ".ct_eq("),
    "virya_seed_inherit_branding": (root / "crates/control-plane-api/src/store.rs", "branding_palette, synesthesia_enabled)"),
    "provisioning_no_rce": (root / "crates/control-plane-api/src/store.rs", '"mode": "workspace_isolated_deployment"'),
    "workspace_unique": (root / "migrations/0001_control_plane.sql", "control_plane_tenant_workspace_uidx"),
    "palette_contrast": (root / "crates/control-plane-api/src/validation.rs", "WCAG AA 4.5:1"),
    "runtime_report": (root / "crates/control-plane-api/src/routes.rs", '"/tenants/{slug}/runtime"'),
    "solid_query": (root / "frontend/src/main.tsx", "@tanstack/solid-query"),
    "solid_router": (root / "frontend/src/main.tsx", "@tanstack/solid-router"),
}
for name, (file, needle) in checks.items():
    text = file.read_text()
    assert needle in text, f"{name} missing in {file}"
print(f"CONTROL_PLANE_STATIC=PASS checks={len(checks)}")
