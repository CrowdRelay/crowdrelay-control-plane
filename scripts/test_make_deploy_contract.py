from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
MAKEFILE = (ROOT / "Makefile").read_text()
WAITER = ROOT / "scripts/deploy.sh"
TEXT = WAITER.read_text()


class MakeDeployContract(unittest.TestCase):
    def test_shell_syntax(self) -> None:
        subprocess.run(["bash", "-n", str(WAITER)], check=True)

    def test_make_deploy_waits_for_exact_main_ci(self) -> None:
        self.assertIn("deploy:\n\tbash scripts/deploy.sh", MAKEFILE)
        self.assertIn('--workflow "CI"', TEXT)
        self.assertIn('origin/main mismatch', TEXT)
        self.assertIn('scripts/deploy-production.sh', TEXT)

    def test_tunnel_is_verified_after_success_or_rollback(self) -> None:
        for token in (
            "verify_live_tunnel",
            "Control Plane deploy/rollback left the tunnel unhealthy",
            "crowdrelay-control-plane-virya-area-tunnel-1",
            "{{.HostConfig.NetworkMode}}",
            "caddy validate --config /etc/caddy/Caddyfile",
            "/api/v1/tenants/virya/operations/summary",
            "CONTROL_PLANE_TUNNEL_GATE=PASS",
        ):
            self.assertIn(token, TEXT)


if __name__ == "__main__":
    unittest.main()
