from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/deploy-production-exact.sh"
DOCKERFILE = ROOT / "Dockerfile"
MAKEFILE = ROOT / "Makefile"


class ProductionDeployContract(unittest.TestCase):
    def test_mac_deploy_is_exact_and_fail_closed(self):
        text = SCRIPT.read_text()
        self.assertIn('CONTROL_PLANE_DEPLOY_HOST:-virya-home', text)
        self.assertIn('production deploy must run from main', text)
        self.assertIn('origin/main mismatch', text)
        self.assertIn('--platform linux/amd64', text)
        self.assertIn('--build-arg "VCS_REF=$TARGET"', text)
        self.assertIn('docker save -o', text)
        self.assertIn('scp -q', text)
        self.assertIn('sudo bash -s', text)

    def test_app_and_tunnel_are_one_release_unit(self):
        text = SCRIPT.read_text()
        self.assertIn('--force-recreate app virya-area-tunnel', text)
        self.assertIn('tunnel namespace mismatch', text)
        self.assertIn('tunnel Caddyfile mount drift', text)
        self.assertIn('/srv/crowdrelay-control-plane', text)
        self.assertIn('CONTROL_PLANE_VIRYA_MANAGEMENT_URL', text)
        self.assertIn('http://127.0.0.1:18080', text)

    def test_deploy_has_rollback_and_e2e_gate(self):
        text = SCRIPT.read_text()
        self.assertIn('ROLLBACK=START', text)
        self.assertIn('ROLLBACK=PASS', text)
        self.assertIn('cp -p "$backup" .env', text)
        self.assertIn('/api/v1/tenants/virya/operations/summary', text)
        self.assertIn('operations summary is not an object', text)
        self.assertIn('http.p95_ms missing', text)
        self.assertIn('CONTROL_PLANE_DEPLOY=PASS', text)

    def test_runtime_image_carries_source_revision(self):
        dockerfile = DOCKERFILE.read_text()
        self.assertIn('ARG VCS_REF=unknown', dockerfile)
        self.assertIn('LABEL org.opencontainers.image.revision=$VCS_REF', dockerfile)

    def test_makefile_exposes_single_canonical_command(self):
        makefile = MAKEFILE.read_text()
        self.assertIn('deploy-production:', makefile)
        self.assertIn('bash scripts/deploy-production-exact.sh', makefile)


if __name__ == "__main__":
    unittest.main()
