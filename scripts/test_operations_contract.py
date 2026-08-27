#!/usr/bin/env python3
"""Guard the tenant-scoped operators channel and its UX contract."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

routes = read("crates/control-plane-api/src/operations_routes.rs")
client = read("crates/control-plane-api/src/tenant_area_client.rs")
config = read("crates/control-plane-api/src/config.rs")
ui = read("frontend/src/components/OperationsPanel.tsx")
tenant = read("frontend/src/pages/TenantPage.tsx")
styles = read("frontend/src/styles.css")

for route in (
    '"/tenants/{slug}/operations/summary"',
    '"/tenants/{slug}/operations/flags"',
    '"/tenants/{slug}/operations/flags/{key}"',
    '"/tenants/{slug}/operations/autopilot"',
    '"/tenants/{slug}/operations/autopilot/{context}"',
):
    assert route in routes, route

for upstream in (
    '"/v1/control-plane/ops/summary"',
    '"/v1/control-plane/ecosystem/flags"',
    '"/v1/control-plane/autopilot/overview"',
):
    assert upstream in routes or upstream in client, upstream

assert "CONTROL_PLANE_MANAGEMENT_MASTER_KEY" in config
assert "CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY" in config
assert "CONTROL_PLANE_VIRYA_MANAGEMENT_URL" in config
assert "DEFAULT_VIRYA_MANAGEMENT_URL" not in config
assert 'http://127.0.0.1:8080' not in config
assert 'area_management_master_key.is_some() || management_master_key.is_some()' in config
assert 'CONTROL_PLANE_VIRYA_MANAGEMENT_URL is required when tenant management is configured' in config
assert "crowdrelay-control-plane-v1:" in client
assert "crowdrelay-area-admin-v1:" in client
assert "Idempotency-Key" in client
assert "valid_operations_request" in client
assert "upstream redirect refused" in client
assert "upstream returned an empty success body" in client
assert "fn object_no_store" in routes and "if !value.is_object()" in routes
assert "fn array_no_store" in routes and "if !value.is_array()" in routes
flags_block = routes.split("async fn flags", 1)[1].split("struct FlagMutation", 1)[0]
assert 'array_no_store(value, "flags")' in flags_block
summary_block = routes.split("async fn summary", 1)[1].split("async fn flags", 1)[0]
assert 'object_no_store(value, "summary")' in summary_block
assert ".audit_control_command(" in routes
assert '"succeeded"' in routes and '"failed"' in routes
audit_block = routes.split("async fn audit_result", 1)[1].split("async fn summary", 1)[0]
assert "body" not in audit_block and "input" not in audit_block, "audit must record outcome only, never mutation payloads"

for marker in (
    "HTTP p95", "p50", "Runtime switches", "AUTOPILOT", "Authority policies",
    "watchdog", "dead queue item", "rum_metrics_24h", "p75", "p95",
):
    assert marker in ui, marker
assert "disabled={pendingMutation() !== null}" in ui
assert "pending={pendingMutation() !== null}" in ui
assert "expected_version: flag.version" in read("frontend/src/lib/api.ts")
assert "input.expected_version <= 0" in routes
assert "product-action-slot" in tenant and "product-status-slot" in tenant
area = tenant.split("<strong>AREA</strong>", 1)[1].split("<strong>Synesthesia</strong>", 1)[0]
assert area.index(">Manage</Link>") < area.index("<StatusBadge")
assert ".product-entitlement-row{display:grid" in styles
assert ".product-status-slot{display:flex;justify-content:flex-end" in styles

print("CONTROL_PLANE_OPERATIONS=PASS telemetry=p50+p95+queues+rum controls=flags+autopilot transport=tenant-scoped+idempotent+fail-closed+shape-aware virya-target=explicit ux=aligned")
