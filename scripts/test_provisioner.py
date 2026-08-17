from __future__ import annotations

import importlib.util
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("tenant_provisioner", ROOT / "deploy/provisioner.py")
assert SPEC and SPEC.loader
provisioner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(provisioner)

SHA = "0123456789abcdef0123456789abcdef01234567"
TAG = f"sha-{SHA}"


def valid_job(slug: str = "acme") -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "plan": {
            "schema": 3,
            "mode": "local_docker_compose",
            "composeProject": f"crowdrelay-{slug}",
            "tenantSlug": slug,
            "displayName": "ACME Artist",
            "workspaceSlug": slug,
            "crowdRelayBaseUrl": "https://api.acme.example",
            "publicSiteBaseUrl": "https://acme.example",
            "allowedOrigins": ["https://acme.example"],
            "defaultCountryCode": "PL",
            "brandingPalette": {
                "primary": "#8b5cf6",
                "primaryContrast": "#ffffff",
                "accent": "#22d3ee",
                "surface": "#0b0c0f",
                "surfaceElevated": "#15171c",
                "text": "#f7f7f8",
                "textMuted": "#9ca3af",
                "success": "#22c55e",
                "warning": "#f59e0b",
                "danger": "#ef4444",
            },
            "desiredVersion": TAG,
            "apiImage": f"ghcr.io/wojciechbator/crowdrelay-api:{TAG}",
            "workerImage": f"ghcr.io/wojciechbator/crowdrelay-worker:{TAG}",
        },
    }


class DummyConfig:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.port_start = 28100
        self.port_end = 28120
        self.postgres_image = "postgres:18-alpine"
        self.docker = "docker"


class ProvisionerContractTests(unittest.TestCase):
    def test_safe_plan_accepts_fixed_schema(self):
        plan = provisioner.safe_plan(valid_job())
        self.assertEqual(plan["tenantSlug"], "acme")
        self.assertEqual(plan["desiredVersion"], TAG)

    def test_safe_plan_rejects_identity_escape_and_mutable_images(self):
        cases = []
        job = valid_job("../escape")
        cases.append(job)
        job = valid_job()
        job["plan"]["composeProject"] = "root-project"
        cases.append(job)
        job = valid_job()
        job["plan"]["desiredVersion"] = "latest"
        job["plan"]["apiImage"] = "ghcr.io/wojciechbator/crowdrelay-api:latest"
        job["plan"]["workerImage"] = "ghcr.io/wojciechbator/crowdrelay-worker:latest"
        cases.append(job)
        job = valid_job()
        job["plan"]["apiImage"] = f"ghcr.io/wojciechbator/crowdrelay-api:sha-{'f' * 40}"
        cases.append(job)
        job = valid_job()
        job["plan"]["apiImage"] = f"ghcr.io/wojciechbator/../crowdrelay-api:{TAG}"
        cases.append(job)
        job = valid_job()
        job["plan"]["publicSiteBaseUrl"] = "http://acme.example"
        cases.append(job)
        job = valid_job()
        job["plan"]["crowdRelayBaseUrl"] = "https://api.acme.example/path"
        cases.append(job)
        job = valid_job()
        job["plan"]["displayName"] = "ACME\nCROWDRELAY_AUTOPILOT_ENABLED=true"
        cases.append(job)
        job = valid_job()
        job["plan"]["allowedOrigins"] = ["https://acme.example\nEVIL=1"]
        cases.append(job)
        job = valid_job()
        job["plan"]["brandingPalette"] = {"primary": "not-a-color"}
        cases.append(job)
        for case in cases:
            with self.subTest(plan=case["plan"]):
                with self.assertRaises(provisioner.ProvisionError):
                    provisioner.safe_plan(case)

    def test_compose_is_fixed_isolated_local_stack(self):
        plan = provisioner.safe_plan(valid_job())
        compose = provisioner.render_compose(plan, 28100, "postgres:18-alpine")
        for service in ("postgres:", "setup:", "api:", "worker:"):
            self.assertIn(service, compose)
        self.assertIn(f'127.0.0.1:28100:8080', compose)
        self.assertIn(f'crowdrelay-api:{TAG}', compose)
        self.assertIn(f'crowdrelay-worker:{TAG}', compose)
        self.assertIn('env_file: [.env, tenant.env]', compose)
        self.assertIn('read_only: true', compose)
        self.assertIn('no-new-privileges:true', compose)
        self.assertGreaterEqual(compose.count("mem_limit:"), 4)
        self.assertGreaterEqual(compose.count("cpus:"), 4)
        self.assertGreaterEqual(compose.count("pids_limit:"), 4)
        self.assertIn("mem_limit: 384m", compose)
        self.assertEqual(compose.count("options: {max-size:"), 3)
        self.assertNotIn("/var/run/docker.sock", compose)
        self.assertNotIn("network_mode: host", compose)
        self.assertNotIn("privileged: true", compose)

    def test_env_splits_write_once_secrets_from_refreshable_runtime_config(self):
        plan = provisioner.safe_plan(valid_job())
        secret_text = provisioner.create_secret_env(plan)
        runtime_text = provisioner.create_runtime_env(plan)
        secrets_map = dict(line.split("=", 1) for line in secret_text.strip().splitlines())
        runtime = dict(line.split("=", 1) for line in runtime_text.strip().splitlines())
        self.assertIn("POSTGRES_PASSWORD", secrets_map)
        self.assertIn("CROWDRELAY_RESPONSE_ENCRYPTION_SECRET", secrets_map)
        self.assertNotEqual(secrets_map["CROWDRELAY_ADMIN_API_KEY"], secrets_map["CROWDRELAY_STAFF_API_KEY"])
        self.assertGreaterEqual(len(secrets_map["CROWDRELAY_QR_SIGNING_SECRET"]), 32)
        self.assertNotIn("CROWDRELAY_ALLOWED_ORIGINS", secrets_map)
        self.assertEqual(runtime["CROWDRELAY_ENV"], "production")
        self.assertEqual(runtime["CROWDRELAY_TENANT_DISPLAY_NAME"], "ACME Artist")
        self.assertEqual(runtime["CROWDRELAY_ALLOWED_ORIGINS"], "https://acme.example")
        self.assertEqual(runtime["CROWDRELAY_TENANT_COLOR_ACCENT"], "#8b5cf6")
        self.assertEqual(runtime["CROWDRELAY_TENANT_COLOR_BACKGROUND"], "#0b0c0f")
        self.assertEqual(runtime["CROWDRELAY_AUTOPILOT_ENABLED"], "false")
        self.assertEqual(runtime["CROWDRELAY_RANDOM_DRAWS_ENABLED"], "false")
        self.assertNotIn("latest", secret_text + runtime_text)

    def test_prepare_files_preserves_secrets_but_refreshes_tenant_config_and_success_metadata(self):
        plan = provisioner.safe_plan(valid_job())
        with tempfile.TemporaryDirectory() as tmp:
            config = DummyConfig(Path(tmp))
            tenant_dir, port = provisioner.prepare_files(config, plan)
            secret_before = (tenant_dir / ".env").read_bytes()
            runtime_before = (tenant_dir / "tenant.env").read_text()
            mode = stat.S_IMODE((tenant_dir / ".env").stat().st_mode)
            self.assertEqual(mode, 0o600)
            self.assertEqual(stat.S_IMODE((tenant_dir / "tenant.env").stat().st_mode), 0o600)
            metadata = json.loads((tenant_dir / "deployment.json").read_text())
            metadata.update({"deployedSha": "f" * 40, "schemaVersion": 63, "workspaceId": "a" * 36})
            (tenant_dir / "deployment.json").write_text(json.dumps(metadata))

            upgraded = valid_job()["plan"].copy()
            new_sha = "fedcba9876543210fedcba9876543210fedcba98"
            upgraded["desiredVersion"] = f"sha-{new_sha}"
            upgraded["apiImage"] = f"ghcr.io/wojciechbator/crowdrelay-api:sha-{new_sha}"
            upgraded["workerImage"] = f"ghcr.io/wojciechbator/crowdrelay-worker:sha-{new_sha}"
            upgraded["displayName"] = "ACME Artist Updated"
            upgraded["publicSiteBaseUrl"] = "https://new.acme.example"
            upgraded["allowedOrigins"] = ["https://new.acme.example"]
            second_dir, second_port = provisioner.prepare_files(config, provisioner.safe_plan({"plan": upgraded}))

            self.assertEqual(second_dir, tenant_dir)
            self.assertEqual(second_port, port)
            self.assertEqual((tenant_dir / ".env").read_bytes(), secret_before)
            runtime_after = (tenant_dir / "tenant.env").read_text()
            self.assertNotEqual(runtime_after, runtime_before)
            self.assertIn("CROWDRELAY_TENANT_DISPLAY_NAME=ACME Artist Updated", runtime_after)
            self.assertIn("CROWDRELAY_ALLOWED_ORIGINS=https://new.acme.example", runtime_after)
            after = json.loads((tenant_dir / "deployment.json").read_text())
            self.assertEqual(after["deployedSha"], "f" * 40)
            self.assertEqual(after["schemaVersion"], 63)
            self.assertEqual(after["desiredVersion"], f"sha-{new_sha}")

    def test_port_allocation_is_unique_across_tenants(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = DummyConfig(Path(tmp))
            first_dir, first_port = provisioner.prepare_files(config, provisioner.safe_plan(valid_job("acme")))
            second_dir, second_port = provisioner.prepare_files(config, provisioner.safe_plan(valid_job("beta")))
            self.assertNotEqual(first_dir, second_dir)
            self.assertNotEqual(first_port, second_port)
            self.assertTrue((config.root / ".allocation.lock").exists())

    def test_existing_duplicate_port_claim_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = DummyConfig(Path(tmp))
            first_dir, first_port = provisioner.prepare_files(config, provisioner.safe_plan(valid_job("acme")))
            second_dir = config.root / "beta"
            second_dir.mkdir(mode=0o700)
            (second_dir / "deployment.json").write_text(json.dumps({"apiPort": first_port}))
            with self.assertRaises(provisioner.ProvisionError) as caught:
                provisioner.choose_port(config, first_dir)
            self.assertEqual(caught.exception.code, "port_allocation_conflict")

    def test_retryable_control_plane_error_does_not_terminally_fail_claim(self):
        claim = {"job": valid_job(), "claimToken": "0" * 32}
        config = type("ConfigStub", (), {"worker_id": "worker-1"})()
        retryable = provisioner.ProvisionError(
            "control_plane_unavailable", "timeout", terminal=False
        )
        with (
            mock.patch.object(provisioner, "api", return_value={"claim": claim}),
            mock.patch.object(provisioner, "process_claim", side_effect=retryable),
            mock.patch.object(provisioner, "fail_claim") as fail_claim,
        ):
            self.assertTrue(provisioner.claim_once(config))
            fail_claim.assert_not_called()

    def test_terminal_provisioning_error_is_reported(self):
        claim = {"job": valid_job(), "claimToken": "0" * 32}
        config = type("ConfigStub", (), {"worker_id": "worker-1"})()
        terminal = provisioner.ProvisionError("invalid_plan", "bad plan")
        with (
            mock.patch.object(provisioner, "api", return_value={"claim": claim}),
            mock.patch.object(provisioner, "process_claim", side_effect=terminal),
            mock.patch.object(provisioner, "fail_claim") as fail_claim,
        ):
            self.assertTrue(provisioner.claim_once(config))
            fail_claim.assert_called_once_with(config, claim, terminal)

    def test_docker_subprocess_does_not_inherit_control_plane_tokens(self):
        with mock.patch.dict(os.environ, {
            "CONTROL_PLANE_ADMIN_TOKEN": "admin-secret",
            "CONTROL_PLANE_TELEMETRY_TOKEN": "telemetry-secret",
            "CONTROL_PLANE_PROVISIONER_TOKEN": "provisioner-secret",
            "DOCKER_HOST": "unix:///run/docker.sock",
        }, clear=True):
            child = provisioner.docker_subprocess_env()
        self.assertNotIn("CONTROL_PLANE_ADMIN_TOKEN", child)
        self.assertNotIn("CONTROL_PLANE_TELEMETRY_TOKEN", child)
        self.assertNotIn("CONTROL_PLANE_PROVISIONER_TOKEN", child)
        self.assertEqual(child["DOCKER_HOST"], "unix:///run/docker.sock")

    def test_provisioner_has_no_shell_execution_escape_hatch(self):
        source = (ROOT / "deploy/provisioner.py").read_text()
        for forbidden in ("shell=True", "os.system(", "eval(", "exec(", "/var/run/docker.sock"):
            self.assertNotIn(forbidden, source)
        self.assertNotIn("--dry-run", source)
        self.assertIn("subprocess.run(", source)


if __name__ == "__main__":
    unittest.main()
