from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP = (ROOT / "scripts/bootstrap-management.sh").read_text()
DEPLOY = (ROOT / "scripts/deploy.sh").read_text()
EXACT = (ROOT / "scripts/deploy-production-exact.sh").read_text()
AREA = (ROOT / "deploy/compose.area.production.yml").read_text()


class TunnelReadinessRaceContract(unittest.TestCase):
    def test_bootstrap_recovers_readiness_without_second_mutation(self) -> None:
        self.assertIn("MANAGEMENT_BOOTSTRAP_READINESS=RETRY", BOOTSTRAP)
        self.assertIn('ensure-virya-management-credentials.sh\" --check', BOOTSTRAP)
        self.assertIn("mutation_retried=false", BOOTSTRAP)

    def test_outer_gate_keeps_real_operations_e2e_recovery(self) -> None:
        self.assertIn("CONTROL_PLANE_TUNNEL_READINESS=PASS", DEPLOY)
        self.assertIn("for attempt in $(seq 1 30)", DEPLOY)
        self.assertIn("operations/summary", DEPLOY)

    def test_exact_deploy_uses_tunnel_health_before_management_e2e(self) -> None:
        self.assertIn("wait_for_tunnel", EXACT)
        self.assertIn('[[ "$tunnel_health" == "healthy" ]]', EXACT)
        self.assertIn("MANAGEMENT_E2E=PASS area=200 summary=200 flags=200 autopilot=200 attention=200", EXACT)
        self.assertIn("healthcheck:", AREA)
        self.assertIn("http://127.0.0.1:18080/healthz/ready", AREA)
        for path in (
            "/api/v1/tenants/virya/area",
            "/api/v1/tenants/virya/operations/summary",
            "/api/v1/tenants/virya/operations/flags",
            "/api/v1/tenants/virya/operations/autopilot",
            "/api/v1/tenants/virya/operations/attention",
        ):
            self.assertIn(path, EXACT)


if __name__ == "__main__":
    unittest.main()