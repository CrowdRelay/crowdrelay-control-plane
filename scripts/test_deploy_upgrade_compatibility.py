from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
WRAPPER = ROOT / "scripts/deploy.sh"
EXACT = ROOT / "scripts/deploy-production-exact.sh"
WRAPPER_TEXT = WRAPPER.read_text()
EXACT_TEXT = EXACT.read_text()


class DeployUpgradeCompatibility(unittest.TestCase):
    def test_shell_syntax(self) -> None:
        subprocess.run(["bash", "-n", str(WRAPPER)], check=True)
        subprocess.run(["bash", "-n", str(EXACT)], check=True)

    def test_pinned_caddy_preflight_uses_explicit_binary_entrypoint(self) -> None:
        self.assertIn("--entrypoint caddy", EXACT_TEXT)
        self.assertIn('"$caddy_image" validate --config /etc/caddy/Caddyfile', EXACT_TEXT)

    def test_live_recovery_gate_is_upgrade_compatible(self) -> None:
        start = WRAPPER_TEXT.index("verify_live_tunnel()")
        end = WRAPPER_TEXT.index("\nensure_live_tunnel()", start)
        gate = WRAPPER_TEXT[start:end]
        self.assertIn("CONTROL_PLANE_TUNNEL_GATE=PASS e2e=true json=true", gate)
        self.assertNotIn("schema_version missing", gate)
        self.assertNotIn("http.p95_ms missing", gate)

    def test_post_deploy_gate_remains_semantically_strict(self) -> None:
        self.assertIn('raise SystemExit("operations summary is not an object")', EXACT_TEXT)
        self.assertIn('raise SystemExit("schema_version missing")', EXACT_TEXT)
        self.assertIn('raise SystemExit("http.p95_ms missing")', EXACT_TEXT)
        self.assertIn("MANAGEMENT_E2E=PASS area=200 summary=200 flags=200 autopilot=200", EXACT_TEXT)


if __name__ == "__main__":
    unittest.main()
