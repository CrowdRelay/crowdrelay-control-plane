from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP = (ROOT / "scripts/bootstrap-management.sh").read_text()
CREDENTIALS = (ROOT / "scripts/ensure-virya-management-credentials.sh").read_text()
JUSTFILE = (ROOT / "justfile").read_text()
OVERLAY = (ROOT / "deploy/compose.area.production.yml").read_text()


class BootstrapManagementOrderingContract(unittest.TestCase):
    def test_shell_syntax(self) -> None:
        subprocess.run(["bash", "-n", str(ROOT / "scripts/bootstrap-management.sh")], check=True)

    def test_make_uses_canonical_bootstrap_wrapper(self) -> None:
        self.assertIn("bootstrap-management:\n    bash scripts/bootstrap-management.sh", JUSTFILE)

    def test_wrapper_installs_canonical_overlay_before_credential_apply(self) -> None:
        install_pos = BOOTSTRAP.index('install -m 0644 "$area_source" "$root/compose.area.yml"')
        apply_pos = BOOTSTRAP.index('ensure-virya-management-credentials.sh" --apply')
        self.assertLess(install_pos, apply_pos)
        self.assertIn("CANONICAL_MANAGEMENT_OVERLAY=PASS", BOOTSTRAP)
        self.assertIn("sha256_file", BOOTSTRAP)
        self.assertIn("shasum -a 256", BOOTSTRAP)

    def test_canonical_overlay_injects_all_management_env(self) -> None:
        for key in (
            "CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY",
            "CONTROL_PLANE_MANAGEMENT_MASTER_KEY",
            "CONTROL_PLANE_VIRYA_MANAGEMENT_URL",
        ):
            self.assertIn(key, OVERLAY)
        self.assertIn("http://virya-area-tunnel:18080", CREDENTIALS)


if __name__ == "__main__":
    unittest.main()
