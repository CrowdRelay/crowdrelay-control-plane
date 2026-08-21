from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
ROUTES = (ROOT / "crates/control-plane-api/src/operations_routes.rs").read_text()
CADDY = (ROOT / "deploy/virya-area-tunnel.Caddyfile").read_text()
API = (ROOT / "frontend/src/lib/api.ts").read_text()
TYPES = (ROOT / "frontend/src/lib/types.ts").read_text()
UI = (ROOT / "frontend/src/pages/OperatorAttentionPage.tsx").read_text()


class OperatorMaintenanceContract(unittest.TestCase):
    def test_backend_exposes_only_bounded_control_plane_paths(self) -> None:
        for token in (
            "/v1/control-plane/ops/outbox?status=dead&limit=50",
            "/v1/control-plane/ops/deliveries?status=dead&limit=50",
            "/v1/control-plane/ops/outbox/{event_id}/retry",
            "/v1/control-plane/ops/deliveries/{delivery_id}/retry",
            "/v1/control-plane/ops/operations/{request_id}",
            "/v1/control-plane/ecosystem/overview",
            "/v1/control-plane/ecosystem/findings?limit=50&open_only=true",
            "/v1/control-plane/ecosystem/reconcile",
        ):
            self.assertIn(token, ROUTES)
        self.assertNotIn("/v1/admin/", ROUTES)
        self.assertIn("Uuid::parse_str", ROUTES)
        self.assertIn("correlation_segment", ROUTES)

    def test_mutations_require_idempotency_and_are_audited(self) -> None:
        self.assertGreaterEqual(ROUTES.count("idempotency_key(&headers)?"), 6)
        for action in (
            "tenant.dead_outbox.retried",
            "tenant.dead_delivery.retried",
            "tenant.dead_deliveries.cleared",
            "tenant.ecosystem.reconciled",
        ):
            self.assertIn(action, ROUTES)
        self.assertIn('json!({ "trigger": "manual" })', ROUTES)

    def test_tunnel_remains_narrow(self) -> None:
        for token in (
            "/v1/control-plane/ops/outbox",
            "/v1/control-plane/ops/outbox/*",
            "/v1/control-plane/ops/deliveries",
            "/v1/control-plane/ops/deliveries/*",
            "/v1/control-plane/ops/operations/*",
            "/v1/control-plane/ecosystem/overview",
            "/v1/control-plane/ecosystem/findings",
            "/v1/control-plane/ecosystem/reconcile",
        ):
            self.assertIn(token, CADDY)
        self.assertNotIn("/v1/admin", CADDY)

    def test_frontend_has_typed_maintenance_surfaces(self) -> None:
        for token in (
            "DatabaseRuntimeSummary",
            "AreaRuntimeSummary",
            "OutboxItem",
            "DeliveryDetails",
            "OperationTimeline",
            "ReconciliationFinding",
        ):
            self.assertIn(token, TYPES)
        for token in (
            "deadOutbox:",
            "retryOutbox:",
            "deadDeliveries:",
            "deliveryDetails:",
            "retryDelivery:",
            "operationTimeline:",
            "reconciliationFindings:",
            "runReconciliation:",
        ):
            self.assertIn(token, API)

    def test_operator_attention_balances_polling_and_on_demand_reads(self) -> None:
        self.assertIn("refetchInterval: 15_000", UI)
        self.assertGreaterEqual(UI.count("refetchInterval: 30_000"), 4)
        for token in (
            "POSTGRES RUNTIME",
            "AREA RUNTIME",
            "DEAD OUTBOX",
            "DEAD WEBHOOK DELIVERIES",
            "DELIVERY DETAILS",
            "RECONCILIATION",
            "REQUEST TIMELINE",
            "Run reconciliation",
            "Retry",
        ):
            self.assertIn(token, UI)


if __name__ == "__main__":
    unittest.main()
