from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
DEPLOY_PATH = ROOT / "scripts/deploy.sh"
BOOTSTRAP_WRAPPER_PATH = ROOT / "scripts/bootstrap-management.sh"
BOOTSTRAP_PATH = ROOT / "scripts/ensure-virya-management-credentials.sh"
JUSTFILE = (ROOT / "justfile").read_text()
DEPLOY = DEPLOY_PATH.read_text()
BOOTSTRAP_WRAPPER = BOOTSTRAP_WRAPPER_PATH.read_text()
BOOTSTRAP = BOOTSTRAP_PATH.read_text()


class ManagementDeployHardeningContract(unittest.TestCase):
    def test_make_exposes_explicit_bootstrap(self) -> None:
        self.assertIn("bootstrap-management:", JUSTFILE)
        self.assertIn("bash scripts/bootstrap-management.sh", JUSTFILE)
        self.assertIn("ensure-virya-management-credentials.sh\" --apply", BOOTSTRAP_WRAPPER)

    def test_deploy_checks_credentials_before_waiting_for_ci(self) -> None:
        self.assertIn('bash "$CREDENTIAL_GATE" --check', DEPLOY)
        self.assertLess(
            DEPLOY.index('bash "$CREDENTIAL_GATE" --check'),
            DEPLOY.index("wait_for_ci\n"),
        )
        self.assertIn("run just bootstrap-management before deploy", DEPLOY)

    def test_recovery_preflights_semantic_management_wiring_before_mutation(self) -> None:
        preflight = DEPLOY.index("CONTROL_PLANE_RECOVERY_PREFLIGHT=PASS")
        mutate = DEPLOY.index("compose up -d --no-deps --force-recreate app virya-area-tunnel")
        self.assertLess(preflight, mutate)
        for token in (
            "effective AREA management master is missing",
            "effective operations management master is missing",
            "management masters must be distinct",
            "http://virya-area-tunnel:18080",
        ):
            self.assertIn(token, DEPLOY)

    def test_bootstrap_preserves_running_release_versions(self) -> None:
        self.assertIn("credential reload changed CrowdRelay release", BOOTSTRAP)
        self.assertIn("credential reload changed Control Plane release", BOOTSTRAP)
        self.assertIn("release_versions=unchanged", BOOTSTRAP)
        self.assertIn("worker=untouched proxy=untouched", BOOTSTRAP)

    def test_bootstrap_proves_both_credential_namespaces_end_to_end(self) -> None:
        for token in (
            "crowdrelay-area-admin-v1:",
            "crowdrelay-control-plane-v1:",
            "/api/v1/tenants/virya/area",
            "/api/v1/tenants/virya/operations/summary",
            "/api/v1/tenants/virya/operations/flags",
            "/api/v1/tenants/virya/operations/autopilot",
            "MANAGEMENT_BOOTSTRAP=PASS",
        ):
            self.assertIn(token, BOOTSTRAP)

    def test_bootstrap_never_logs_raw_secrets(self) -> None:
        self.assertNotIn('printf "%s\\n" "$area_token"', BOOTSTRAP)
        self.assertNotIn('printf "%s\\n" "$management_token"', BOOTSTRAP)
        self.assertIn("AREA_DERIVED_SHA256", BOOTSTRAP)
        self.assertIn("MANAGEMENT_DERIVED_SHA256", BOOTSTRAP)


if __name__ == "__main__":
    unittest.main()
