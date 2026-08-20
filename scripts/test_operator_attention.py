#!/usr/bin/env python3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class OperatorAttentionContract(unittest.TestCase):
    def test_operator_attention_surface_is_routed_and_live(self) -> None:
        main = read("frontend/src/main.tsx")
        shell = read("frontend/src/components/Shell.tsx")
        page = read("frontend/src/pages/OperatorAttentionPage.tsx")
        api = read("frontend/src/lib/api.ts")

        self.assertIn("path: '/attention'", main)
        self.assertIn("OperatorAttentionPage", main)
        self.assertIn('to="/attention"', shell)
        self.assertIn("Operator attention required", page)
        self.assertIn("Dead outbox", page)
        self.assertIn("Dead deliveries", page)
        self.assertIn("Dead push", page)
        self.assertIn("Critical watchdog", page)
        self.assertIn("refetchInterval: 15_000", page)
        self.assertIn("Usuń stare dead queues", page)
        self.assertIn("Potwierdź cleanup", page)
        self.assertIn("api.clearDeadDeliveries", page)
        self.assertIn("'idempotency-key': crypto.randomUUID()", api)

    def test_dead_delivery_clear_stays_narrow_and_audited(self) -> None:
        routes = read("crates/control-plane-api/src/operations_routes.rs")
        tunnel = read("deploy/virya-area-tunnel.Caddyfile")

        self.assertIn('/operations/dead-deliveries/clear', routes)
        self.assertIn('/v1/control-plane/ops/deliveries/dead/clear', routes)
        self.assertIn('tenant.dead_deliveries.cleared', routes)
        self.assertIn('idempotency_key(&headers)', routes)
        self.assertIn('/v1/control-plane/ops/deliveries/dead/clear', tunnel)
        self.assertNotIn('/v1/admin', tunnel)


if __name__ == "__main__":
    unittest.main()
