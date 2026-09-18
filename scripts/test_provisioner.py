from __future__ import annotations

import concurrent.futures
import importlib.util
import json
import os
import stat
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

try:
    import yaml
except ImportError:
    yaml = None

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("tenant_provisioner", ROOT / "deploy/provisioner.py")
assert SPEC and SPEC.loader
provisioner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(provisioner)

SHA = "0123456789abcdef0123456789abcdef01234567"
TAG = f"sha-{SHA}"
API_DIGEST = "sha256:" + "a" * 64
WORKER_DIGEST = "sha256:" + "b" * 64
PINNED = {
    "api": f"ghcr.io/crowdrelay/crowdrelay-api@{API_DIGEST}",
    "worker": f"ghcr.io/crowdrelay/crowdrelay-worker@{WORKER_DIGEST}",
}


def valid_job(slug: str = "acme") -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "plan": {
            "schema": 3,
            "mode": "local_docker_compose",
            "tenantId": "00000000-0000-0000-0000-000000000123",
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
            "apiImage": f"ghcr.io/crowdrelay/crowdrelay-api:{TAG}",
            "workerImage": f"ghcr.io/crowdrelay/crowdrelay-worker:{TAG}",
        },
    }


REGIONAL_PROFILE = {
    "countryCode": "PL",
    "region": "eu",
    "locale": "pl-PL",
    "timezone": "Europe/Warsaw",
    "currency": "PLN",
    "dateFormat": "dmy",
    "numberFormat": "comma_decimal",
    "dataRegion": "eu",
}


def valid_job5(slug: str = "acme", placement: str = "shared_pg") -> dict:
    """A schema-5 job: placement-aware plan as produced by deployment_plan()."""
    job = valid_job(slug)
    job["plan"]["schema"] = 5
    job["plan"]["regionalProfile"] = dict(REGIONAL_PROFILE)
    job["plan"]["placement"] = placement
    if placement == "shared_pg":
        job["plan"]["sharedPg"] = {
            "host": "crowdrelay-tenants-pg",
            "network": "crowdrelay-tenants",
            "database": provisioner.placement_database_name(
                slug, job["plan"]["tenantId"]
            ),
        }
    return job


class DummyConfig:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.port_start = 28100
        self.port_end = 28120
        self.postgres_image = "postgres:18-alpine"
        self.docker = "docker"
        self.area_management_master_key = "area-management-master-key-0123456789abcdef"
        self.management_master_key = "operations-management-master-key-0123456789"


class ProvisionerContractTests(unittest.TestCase):
    def test_safe_plan_accepts_fixed_schema(self):
        plan = provisioner.safe_plan(valid_job())
        self.assertEqual(plan["tenantSlug"], "acme")
        self.assertEqual(plan["desiredVersion"], TAG)


    def test_safe_plan_accepts_pre_area_schema3_job_using_top_level_tenant_id(self):
        job = valid_job()
        tenant_id = job["plan"].pop("tenantId")
        job["tenantId"] = tenant_id
        plan = provisioner.safe_plan(job)
        self.assertEqual(plan["tenantId"], tenant_id)
        self.assertNotIn("tenantId", job["plan"])

    def test_safe_plan_accepts_optional_signal_product(self):
        """Signal is an optional add-on. A plan without publicSiteBaseUrl
        and with empty allowedOrigins is valid — CrowdRelay deploys
        without a public site."""
        job = valid_job()
        job["plan"]["publicSiteBaseUrl"] = None
        job["plan"]["allowedOrigins"] = []
        plan = provisioner.safe_plan(job)
        self.assertIsNone(plan["publicSiteBaseUrl"])
        self.assertEqual(plan["allowedOrigins"], [])

    def test_area_secret_is_opt_in_for_existing_provisioner_rollout(self):
        plan = provisioner.safe_plan(valid_job())
        config = DummyConfig(Path("/tmp"))
        config.area_management_master_key = ""
        config.management_master_key = ""
        secret_text = provisioner.create_secret_env(config, plan)
        self.assertNotIn("CROWDRELAY_CONTROL_PLANE_AREA_API_KEY", secret_text)
        self.assertNotIn("CROWDRELAY_CONTROL_PLANE_API_KEY", secret_text)

    def test_safe_plan_rejects_identity_escape_and_mutable_images(self):
        cases = []
        job = valid_job("../escape")
        cases.append(job)
        job = valid_job()
        job["plan"]["composeProject"] = "root-project"
        cases.append(job)
        job = valid_job()
        job["plan"]["desiredVersion"] = "latest"
        job["plan"]["apiImage"] = "ghcr.io/crowdrelay/crowdrelay-api:latest"
        job["plan"]["workerImage"] = "ghcr.io/crowdrelay/crowdrelay-worker:latest"
        cases.append(job)
        job = valid_job()
        job["plan"]["apiImage"] = f"ghcr.io/crowdrelay/crowdrelay-api:sha-{'f' * 40}"
        cases.append(job)
        job = valid_job()
        job["plan"]["apiImage"] = f"ghcr.io/crowdrelay/../crowdrelay-api:{TAG}"
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
        compose = provisioner.render_compose(plan, 28100, "postgres:18-alpine", PINNED)
        for service in ("postgres:", "setup:", "api:", "worker:"):
            self.assertIn(service, compose)
        self.assertIn(f'127.0.0.1:28100:8080', compose)
        # The crowdrelay-shared alias attach is asserted by
        # test_compose_attaches_api_to_edge_network_under_alias — this render
        # passes no edge network, so the attachment must be absent.
        self.assertNotIn("crowdrelay-shared", compose)
        # The running stack is pinned to immutable digests, never to the mutable
        # sha-<commit> tag the plan asked for.
        self.assertIn(PINNED["api"], compose)
        self.assertIn(PINNED["worker"], compose)
        self.assertNotIn(f'crowdrelay-api:{TAG}', compose)
        self.assertNotIn(f'crowdrelay-worker:{TAG}', compose)
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
        config = DummyConfig(Path("/tmp"))
        secret_text = provisioner.create_secret_env(config, plan)
        runtime_text = provisioner.create_runtime_env(plan)
        secrets_map = dict(line.split("=", 1) for line in secret_text.strip().splitlines())
        runtime = dict(line.split("=", 1) for line in runtime_text.strip().splitlines())
        self.assertIn("POSTGRES_PASSWORD", secrets_map)
        self.assertIn("CROWDRELAY_RESPONSE_ENCRYPTION_SECRET", secrets_map)
        self.assertNotEqual(secrets_map["CROWDRELAY_ADMIN_API_KEY"], secrets_map["CROWDRELAY_STAFF_API_KEY"])
        self.assertGreaterEqual(len(secrets_map["CROWDRELAY_QR_SIGNING_SECRET"]), 32)
        self.assertEqual(len(secrets_map["CROWDRELAY_CONTROL_PLANE_AREA_API_KEY"]), 64)
        self.assertEqual(len(secrets_map["CROWDRELAY_CONTROL_PLANE_API_KEY"]), 64)
        self.assertNotEqual(secrets_map["CROWDRELAY_CONTROL_PLANE_API_KEY"], secrets_map["CROWDRELAY_CONTROL_PLANE_AREA_API_KEY"])
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
            upgraded["apiImage"] = f"ghcr.io/crowdrelay/crowdrelay-api:sha-{new_sha}"
            upgraded["workerImage"] = f"ghcr.io/crowdrelay/crowdrelay-worker:sha-{new_sha}"
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

    def test_wait_container_healthy_requires_docker_health(self):
        config = type("ConfigStub", (), {"docker": "docker"})()
        with (
            mock.patch.object(provisioner, "compose_cmd", return_value="container-1\n"),
            mock.patch.object(provisioner, "docker_cmd", side_effect=["starting\n", "healthy\n"]),
            mock.patch.object(provisioner.time, "sleep"),
        ):
            provisioner.wait_container_healthy(config, Path("/tmp"), "project", "worker", 10)

    def test_wait_container_healthy_fails_closed_for_dead_worker(self):
        config = type("ConfigStub", (), {"docker": "docker"})()
        with (
            mock.patch.object(provisioner, "compose_cmd", return_value="container-1\n"),
            mock.patch.object(provisioner, "docker_cmd", return_value="dead\n"),
        ):
            with self.assertRaises(provisioner.ProvisionError) as caught:
                provisioner.wait_container_healthy(config, Path("/tmp"), "project", "worker", 10)
        self.assertEqual(caught.exception.code, "worker_readiness_timeout")

    def test_provisioner_has_no_shell_execution_escape_hatch(self):
        source = (ROOT / "deploy/provisioner.py").read_text()
        for forbidden in ("shell=True", "os.system(", "eval(", "exec(", "/var/run/docker.sock"):
            self.assertNotIn(forbidden, source)

    def test_dry_run_never_claims_a_job_or_mutates_the_control_plane(self):
        # --dry-run is a host readiness check. It must reach the Control Plane
        # zero times: no claim, no lease, no completion, no telemetry.
        config = DummyConfig(Path(tempfile.mkdtemp()))
        config.worker_id = "worker-dry"
        config.observer_concurrency = 4
        with (
            mock.patch.object(provisioner, "validate") as validate,
            mock.patch.object(provisioner, "api") as api_call,
            mock.patch.object(provisioner, "api_with_token") as telemetry_call,
            mock.patch.object(provisioner, "claim_once") as claim,
        ):
            provisioner.dry_run(config)
        validate.assert_called_once_with(config)
        api_call.assert_not_called()
        telemetry_call.assert_not_called()
        claim.assert_not_called()

    def test_image_reference_is_pinned_to_a_verified_digest(self):
        config = DummyConfig(Path(tempfile.mkdtemp()))
        image = f"ghcr.io/crowdrelay/crowdrelay-api:{TAG}"
        inspected = {
            "Config": {"Labels": {"org.opencontainers.image.revision": SHA}},
            "RepoDigests": [f"ghcr.io/crowdrelay/crowdrelay-api@{API_DIGEST}"],
        }
        with (
            mock.patch.object(provisioner, "docker_cmd") as docker,
            mock.patch.object(provisioner, "inspect_image", return_value=inspected),
        ):
            resolved = provisioner.pinned_image_reference(config, image, SHA)
        self.assertEqual(resolved, f"ghcr.io/crowdrelay/crowdrelay-api@{API_DIGEST}")
        self.assertEqual(docker.call_args.args[1], "pull")

    def test_image_built_from_another_revision_is_rejected(self):
        # An OCI tag is mutable. A sha-<commit> tag that was re-pushed from a
        # different commit must never be deployed under that release identity.
        config = DummyConfig(Path(tempfile.mkdtemp()))
        for labels in (
            {"org.opencontainers.image.revision": "f" * 40},
            {},
            {"org.opencontainers.image.revision": "not-a-sha"},
        ):
            inspected = {
                "Config": {"Labels": labels},
                "RepoDigests": [f"ghcr.io/crowdrelay/crowdrelay-api@{API_DIGEST}"],
            }
            with (
                mock.patch.object(provisioner, "docker_cmd"),
                mock.patch.object(provisioner, "inspect_image", return_value=inspected),
                self.assertRaises(provisioner.ProvisionError) as caught,
            ):
                provisioner.pinned_image_reference(
                    config, f"ghcr.io/crowdrelay/crowdrelay-api:{TAG}", SHA
                )
            self.assertIn("image_revision", caught.exception.code)

    def test_same_release_resolving_to_a_new_digest_fails_closed(self):
        deployment = {"desiredVersion": TAG, "apiImageDigest": PINNED["api"]}
        # Identical retry is accepted.
        provisioner.verify_release_digest_stability(
            deployment, TAG, "apiImageDigest", PINNED["api"]
        )
        # The same release identifier now points at different bytes.
        with self.assertRaises(provisioner.ProvisionError) as caught:
            provisioner.verify_release_digest_stability(
                deployment,
                TAG,
                "apiImageDigest",
                "ghcr.io/crowdrelay/crowdrelay-api@sha256:" + "c" * 64,
            )
        self.assertEqual(caught.exception.code, "image_digest_changed")

    def test_api_and_worker_digests_are_tracked_independently(self):
        deployment = {
            "desiredVersion": TAG,
            "apiImageDigest": PINNED["api"],
            "workerImageDigest": PINNED["worker"],
        }
        # A worker digest must not be validated against the API digest record.
        provisioner.verify_release_digest_stability(
            deployment, TAG, "workerImageDigest", PINNED["worker"]
        )
        with self.assertRaises(provisioner.ProvisionError):
            provisioner.verify_release_digest_stability(
                deployment, TAG, "workerImageDigest", PINNED["api"]
            )

    def test_subprocess_output_is_bounded(self):
        # A noisy or hostile image must not be able to grow the agent's memory:
        # only a fixed diagnostic tail is retained.
        lines = provisioner.MAX_OUTPUT_TAIL_LINES
        script = f"import sys\nfor i in range({lines * 20}): print('x' * 4000)\n"
        returncode, output = provisioner.run_bounded(
            [sys.executable, "-c", script], cwd=None, timeout=120, error_code="test_failed"
        )
        self.assertEqual(returncode, 0)
        self.assertLessEqual(len(output.splitlines()), lines)
        self.assertLessEqual(
            len(output), lines * (provisioner.MAX_OUTPUT_TAIL_LINE_BYTES + 1) + 1
        )

    def test_host_writes_are_atomic_and_never_leave_partial_files(self):
        root = Path(tempfile.mkdtemp())
        target = root / "deployment.json"
        provisioner.atomic_write(target, '{"schema": 1}\n', 0o644)
        self.assertEqual(target.read_text(encoding="utf-8"), '{"schema": 1}\n')
        provisioner.atomic_write(target, '{"schema": 2}\n', 0o644)
        self.assertEqual(target.read_text(encoding="utf-8"), '{"schema": 2}\n')
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o644)
        # No temporary artefact may survive a completed replace.
        self.assertEqual(sorted(p.name for p in root.iterdir()), ["deployment.json"])

    def test_write_once_secrets_survive_an_upgrade(self):
        root = Path(tempfile.mkdtemp())
        secret = root / ".env"
        provisioner.write_once(secret, "POSTGRES_PASSWORD=first\n", 0o600)
        provisioner.write_once(secret, "POSTGRES_PASSWORD=second\n", 0o600)
        self.assertEqual(secret.read_text(encoding="utf-8"), "POSTGRES_PASSWORD=first\n")
        self.assertEqual(stat.S_IMODE(secret.stat().st_mode), 0o600)

    def test_observation_is_not_serialised_behind_provisioning(self):
        source = (ROOT / "deploy/provisioner.py").read_text()
        # The claim loop must not be the thing that drives observation.
        main_body = source.split("def main(", 1)[1]
        self.assertNotIn("observe_deployments(config)", main_body)
        self.assertIn("observer_loop", main_body)
        self.assertIn("threading.Thread", main_body)
        # Probes are bounded, never one task per directory entry.
        self.assertIn("max_workers=config.observer_concurrency", source)

    def test_observer_probes_run_with_bounded_concurrency(self):
        root = Path(tempfile.mkdtemp())
        config = DummyConfig(root)
        config.observer_concurrency = 4
        config.telemetry_token = "t" * 32
        for index in range(12):
            slug = f"tenant{index}"
            (root / slug).mkdir()
            (root / slug / "deployment.json").write_text(
                json.dumps(
                    {
                        "tenantSlug": slug,
                        "composeProject": f"crowdrelay-{slug}",
                        "apiPort": 28100 + index,
                    }
                ),
                encoding="utf-8",
            )
        live = 0
        peak = 0
        guard = threading.Lock()

        def probe(*_args, **_kwargs):
            nonlocal live, peak
            with guard:
                live += 1
                peak = max(peak, live)
            time.sleep(0.02)
            with guard:
                live -= 1
            return True

        with (
            mock.patch.object(provisioner, "api_healthy", side_effect=probe),
            mock.patch.object(provisioner, "container_running", return_value=True),
            mock.patch.object(provisioner, "api_with_token") as report,
            concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor,
        ):
            provisioner.observe_deployments(config, executor)
        self.assertEqual(report.call_count, 12)
        self.assertLessEqual(peak, 4)

    def test_lease_is_renewed_while_a_long_step_runs(self):
        config = DummyConfig(Path(tempfile.mkdtemp()))
        config.worker_id = "worker-1"
        with mock.patch.object(provisioner, "renew") as renew:
            with mock.patch.object(provisioner.LeaseKeeper, "INTERVAL_SECONDS", 0.02):
                with provisioner.LeaseKeeper(config, "job-1", "token-1") as lease:
                    time.sleep(0.2)
                    lease.check()
        self.assertGreater(renew.call_count, 1)

    def test_losing_the_lease_aborts_the_deployment(self):
        # If another agent reclaimed the job, this agent must stop rather than
        # keep mutating Docker state it no longer owns.
        config = DummyConfig(Path(tempfile.mkdtemp()))
        config.worker_id = "worker-1"
        stolen = provisioner.ProvisionError("control_plane_http_error", "conflict", terminal=True)
        with mock.patch.object(provisioner, "renew", side_effect=stolen):
            with mock.patch.object(provisioner.LeaseKeeper, "INTERVAL_SECONDS", 0.02):
                with provisioner.LeaseKeeper(config, "job-1", "token-1") as lease:
                    time.sleep(0.15)
                    with self.assertRaises(provisioner.ProvisionError) as caught:
                        lease.check()
        self.assertEqual(caught.exception.code, "lease_lost")

    def test_successful_stack_with_failing_succeed_callback_is_not_marked_failed(self):
        # The stack is already healthy; a 503/timeout on /succeed must be
        # retryable, never a terminal deployment failure.
        transient = provisioner.ProvisionError("control_plane_unavailable", "timeout", terminal=False)
        config = DummyConfig(Path(tempfile.mkdtemp()))
        config.worker_id = "worker-1"
        claim = {"job": valid_job(), "claimToken": "token-1"}
        with (
            mock.patch.object(provisioner, "api", return_value={"claim": claim}),
            mock.patch.object(provisioner, "process_claim", side_effect=transient),
            mock.patch.object(provisioner, "fail_claim") as fail_claim,
        ):
            self.assertTrue(provisioner.claim_once(config))
        fail_claim.assert_not_called()

    def test_claim_accepts_wrapped_and_direct_shapes(self):
        # The server once returned the claim object directly instead of nested
        # under "claim". The agent accepts both during the transition window.
        claim = {"job": valid_job(), "claimToken": "token-1"}
        config = type("ConfigStub", (), {"worker_id": "worker-1"})()
        for response in ({"claim": claim}, claim):
            with self.subTest(response=response):
                with (
                    mock.patch.object(provisioner, "api", return_value=response),
                    mock.patch.object(provisioner, "process_claim") as process_claim,
                ):
                    self.assertTrue(provisioner.claim_once(config))
                process_claim.assert_called_once_with(config, claim)

    def test_claim_response_without_job_is_a_miss(self):
        config = type("ConfigStub", (), {"worker_id": "worker-1"})()
        for response in ({"claim": None}, {}):
            with self.subTest(response=response):
                with (
                    mock.patch.object(provisioner, "api", return_value=response),
                    mock.patch.object(provisioner, "process_claim") as process_claim,
                ):
                    self.assertFalse(provisioner.claim_once(config))
                process_claim.assert_not_called()

    @unittest.skipIf(yaml is None, "PyYAML not installed")
    def test_render_compose_emits_parseable_yaml(self):
        plan = provisioner.safe_plan(valid_job())
        for edge_network in (None, "crowdrelay-shared"):
            with self.subTest(edge_network=edge_network):
                compose = provisioner.render_compose(
                    plan, 28100, "postgres:18-alpine", PINNED, edge_network=edge_network
                )
                parsed = yaml.safe_load(compose)
                self.assertIn("postgres", parsed["services"])
                self.assertIn("worker", parsed["services"])

    def test_compose_uses_postgres19_io_worker_settings(self):
        plan = provisioner.safe_plan(valid_job())
        compose = provisioner.render_compose(plan, 28100, "postgres:18-alpine", PINNED)
        self.assertIn("io_min_workers=2", compose)
        self.assertIn("io_max_workers=2", compose)
        self.assertNotIn("io_workers=", compose)

    @unittest.skipIf(yaml is None, "PyYAML not installed")
    def test_compose_attaches_api_to_edge_network_under_alias(self):
        plan = provisioner.safe_plan(valid_job())
        compose = provisioner.render_compose(
            plan, 28100, "postgres:18-alpine", PINNED, edge_network="crowdrelay-shared"
        )
        parsed = yaml.safe_load(compose)
        api_networks = parsed["services"]["api"]["networks"]
        self.assertIn("crowdrelay-shared", api_networks)
        self.assertEqual(api_networks["crowdrelay-shared"]["aliases"], ["acme-api"])
        self.assertEqual(parsed["networks"]["crowdrelay-shared"]["external"], True)
        # Without an edge network there is no extra attachment at all.
        plain = yaml.safe_load(
            provisioner.render_compose(plan, 28100, "postgres:18-alpine", PINNED)
        )
        self.assertNotIn("networks", plain["services"]["api"])
        self.assertNotIn("networks", plain)

    def test_public_ip_never_publishes_loopback_or_private(self):
        config = type("ConfigStub", (), {"public_ip": ""})()

        class FakeSocket:
            def __init__(self, address):
                self.address = address
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def connect(self, target):
                pass
            def getsockname(self):
                return (self.address, 0)

        for bad_address in ("127.0.1.1", "10.0.0.138", "192.168.1.5", ""):
            with self.subTest(address=bad_address):
                with mock.patch.object(
                    provisioner.socket, "socket", return_value=FakeSocket(bad_address)
                ):
                    with self.assertRaises(provisioner.ProvisionError) as caught:
                        provisioner.host_public_ip(config)
                self.assertEqual(caught.exception.code, "public_ip_unknown")

        # A globally routable outbound address is accepted when nothing is
        # configured — detection works on hosts that hold their own public IP.
        with mock.patch.object(
            provisioner.socket, "socket", return_value=FakeSocket("152.70.162.119")
        ):
            self.assertEqual(provisioner.host_public_ip(config), "152.70.162.119")

        # An explicit override always wins.
        override = type("ConfigStub", (), {"public_ip": "152.70.162.119"})()
        self.assertEqual(provisioner.host_public_ip(override), "152.70.162.119")


class SharedPlacementContractTests(unittest.TestCase):
    """Contract for schema-5 shared_pg plans: the tenant database lives on the
    shared cluster while api+worker stay dedicated per tenant."""

    def test_schema5_shared_plan_validates(self):
        plan = provisioner.safe_plan(valid_job5())
        self.assertEqual(plan["placement"], "shared_pg")
        self.assertEqual(plan["sharedPg"]["database"], "t_acme")
        self.assertEqual(plan["sharedPg"]["host"], "crowdrelay-tenants-pg")

    def test_schema5_dedicated_plan_validates_without_shared_pg(self):
        plan = provisioner.safe_plan(valid_job5(placement="dedicated"))
        self.assertEqual(plan["placement"], "dedicated")
        self.assertNotIn("sharedPg", plan)

    def test_schemas_3_and_4_normalize_to_dedicated(self):
        job = valid_job()
        plan = provisioner.safe_plan(job)
        self.assertEqual(plan["placement"], "dedicated")
        job["plan"]["schema"] = 4
        job["plan"]["regionalProfile"] = dict(REGIONAL_PROFILE)
        plan = provisioner.safe_plan(job)
        self.assertEqual(plan["placement"], "dedicated")

    def test_schema5_rejects_misplaced_or_malformed_shared_fields(self):
        cases = []
        job = valid_job5()
        job["plan"]["placement"] = "somewhere_else"
        cases.append(job)
        job = valid_job5()
        del job["plan"]["sharedPg"]
        cases.append(job)
        job = valid_job5()
        job["plan"]["sharedPg"]["database"] = "postgres"  # not t_-derived
        cases.append(job)
        job = valid_job5()
        job["plan"]["sharedPg"]["database"] = "t_other"  # not this tenant's
        cases.append(job)
        job = valid_job5()
        job["plan"]["sharedPg"]["host"] = "virya-postgres; rm -rf /"
        cases.append(job)
        job = valid_job5(placement="dedicated")
        job["plan"]["sharedPg"] = {"host": "x", "network": "y", "database": "t_acme"}
        cases.append(job)
        for case in cases:
            with self.subTest(plan=case["plan"].get("sharedPg", case["plan"].get("placement"))):
                with self.assertRaises(provisioner.ProvisionError):
                    provisioner.safe_plan(case)

    def test_placement_database_name_derivation(self):
        self.assertEqual(provisioner.placement_database_name("acme", "x"), "t_acme")
        self.assertEqual(
            provisioner.placement_database_name("my-band-2026", "x"), "t_my_band_2026"
        )
        # Slugs over 60 chars truncate and disambiguate on the tenant id.
        tenant_id = "3f8a1c2e-0000-4000-8000-000000000000"
        long_slug = "a" * 63
        derived = provisioner.placement_database_name(long_slug, tenant_id)
        self.assertLessEqual(len(derived), 63)
        self.assertTrue(derived.endswith("_3f8a1c2e"))

    @unittest.skipIf(yaml is None, "PyYAML not installed")
    def test_shared_compose_has_no_postgres_and_joins_tenants_network(self):
        plan = provisioner.safe_plan(valid_job5())
        parsed = yaml.safe_load(
            provisioner.render_compose(
                plan, 28100, "postgres:18-alpine", PINNED,
                edge_network="crowdrelay-shared",
            )
        )
        self.assertNotIn("postgres", parsed["services"])
        self.assertNotIn("volumes", parsed)
        for service in ("setup", "api", "worker"):
            self.assertIn("crowdrelay-tenants", parsed["services"][service]["networks"])
        self.assertEqual(
            parsed["services"]["api"]["networks"]["crowdrelay-shared"]["aliases"],
            ["acme-api"],
        )
        self.assertTrue(parsed["networks"]["crowdrelay-tenants"]["external"])
        self.assertTrue(parsed["networks"]["crowdrelay-shared"]["external"])

    @unittest.skipIf(yaml is None, "PyYAML not installed")
    def test_dedicated_compose_is_unchanged(self):
        plan = provisioner.safe_plan(valid_job5(placement="dedicated"))
        parsed = yaml.safe_load(
            provisioner.render_compose(plan, 28100, "postgres:18-alpine", PINNED)
        )
        self.assertIn("postgres", parsed["services"])
        self.assertIn("postgres", parsed["volumes"])
        self.assertNotIn("networks", parsed["services"]["api"])

    def test_shared_env_points_database_url_at_the_cluster(self):
        plan = provisioner.safe_plan(valid_job5())
        secrets_map = dict(
            line.split("=", 1)
            for line in provisioner.create_secret_env(
                DummyConfig(Path("/tmp")), plan
            ).strip().splitlines()
        )
        self.assertEqual(secrets_map["POSTGRES_DB"], "t_acme")
        self.assertEqual(secrets_map["POSTGRES_USER"], "t_acme")
        url = secrets_map["CROWDRELAY_DATABASE_URL"]
        self.assertIn("@crowdrelay-tenants-pg:5432/t_acme", url)
        self.assertIn("t_acme:", url)

    def test_ensure_shared_database_creates_role_db_and_revokes_public(self):
        plan = provisioner.safe_plan(valid_job5())
        calls = []

        def fake_docker(config, *args, timeout, error_code):
            calls.append(args)
            joined = " ".join(str(a) for a in args)
            if "pg_isready" in joined:
                return "accepting connections"
            if "SELECT 1 FROM pg_roles" in joined or "SELECT 1 FROM pg_database" in joined:
                return ""
            return ""

        config = DummyConfig(Path("/tmp"))
        config.shared_pg_clusters = {"crowdrelay-tenants-pg"}
        with tempfile.TemporaryDirectory() as tmp:
            tenant_dir = Path(tmp)
            provisioner.write_once(
                tenant_dir / ".env", "POSTGRES_PASSWORD=not-a-real-password\n", 0o600
            )
            with mock.patch.object(provisioner, "docker_cmd", fake_docker):
                provisioner.ensure_shared_database(config, plan, tenant_dir)

        text = " ".join(" ".join(map(str, call)) for call in calls)
        self.assertIn("network inspect crowdrelay-tenants", text)
        self.assertIn("pg_isready", text)
        self.assertIn("CREATE ROLE t_acme LOGIN PASSWORD 'not-a-real-password'", text)
        self.assertIn(f"CONNECTION LIMIT {provisioner.SHARED_PG_CONNECTION_LIMIT}", text)
        self.assertIn("CREATE DATABASE t_acme OWNER t_acme", text)
        self.assertIn("REVOKE CONNECT ON DATABASE t_acme FROM PUBLIC", text)

    def test_ensure_shared_database_is_idempotent_and_fail_closed(self):
        plan = provisioner.safe_plan(valid_job5())
        calls = []

        def fake_docker(config, *args, timeout, error_code):
            calls.append(args)
            joined = " ".join(str(a) for a in args)
            if "SELECT 1 FROM pg_roles" in joined or "SELECT 1 FROM pg_database" in joined:
                return "1"  # existing tenant redeploy: nothing is recreated
            return ""

        config = DummyConfig(Path("/tmp"))
        config.shared_pg_clusters = {"crowdrelay-tenants-pg"}
        with tempfile.TemporaryDirectory() as tmp:
            provisioner.write_once(
                Path(tmp) / ".env", "POSTGRES_PASSWORD=not-a-real-password\n", 0o600
            )
            with mock.patch.object(provisioner, "docker_cmd", fake_docker):
                provisioner.ensure_shared_database(config, plan, Path(tmp))
        text = " ".join(" ".join(map(str, call)) for call in calls)
        self.assertNotIn("CREATE ROLE", text)
        self.assertNotIn("CREATE DATABASE", text)
        # The revoke/limit are re-asserted on every run.
        self.assertIn("REVOKE CONNECT", text)
        self.assertIn("CONNECTION LIMIT", text)

        # A plan naming a cluster outside the allowlist is refused before any
        # docker call touches it.
        bad = provisioner.safe_plan(valid_job5())
        bad["sharedPg"]["host"] = "virya-postgres-1"
        with tempfile.TemporaryDirectory() as tmp:
            provisioner.write_once(Path(tmp) / ".env", "POSTGRES_PASSWORD=not-a-real-password\n", 0o600)
            with self.assertRaises(provisioner.ProvisionError) as ctx:
                provisioner.ensure_shared_database(config, bad, Path(tmp))
            self.assertEqual(ctx.exception.code, "invalid_plan")


if __name__ == "__main__":
    unittest.main()
