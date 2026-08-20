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
        self.assertIn('still waiting for CI run', TEXT)

    def test_wrapper_does_not_depend_on_executable_bit(self) -> None:
        self.assertNotIn('[[ -x "$CANONICAL" ]]', TEXT)
        self.assertIn('[[ -f "$CANONICAL" && ! -L "$CANONICAL" ]]', TEXT)
        self.assertIn('bash "$CANONICAL" "$TARGET"', TEXT)

    def test_tunnel_is_verified_first_and_self_healed_only_if_needed(self) -> None:
        for token in (
            "verify_live_tunnel",
            "ensure_live_tunnel",
            "repair_live_release_unit",
            "CONTROL_PLANE_TUNNEL_RECOVERY=NOOP",
            "CONTROL_PLANE_TUNNEL_RECOVERY=REPAIR",
            "CONTROL_PLANE_RELEASE_UNIT_REPAIR=PASS",
            "trap on_interrupt INT TERM HUP",
            "crowdrelay-control-plane-virya-area-tunnel-1",
            "{{.HostConfig.NetworkMode}}",
            "caddy validate --config /etc/caddy/Caddyfile",
            "/api/v1/tenants/virya/operations/summary",
            "CONTROL_PLANE_TUNNEL_GATE=PASS",
        ):
            self.assertIn(token, TEXT)
        self.assertLess(TEXT.index("if verify_live_tunnel; then"), TEXT.index("repair_live_release_unit || return 1"))


if __name__ == "__main__":
    unittest.main()
