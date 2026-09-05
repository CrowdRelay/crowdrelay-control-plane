#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import subprocess
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("runtime_observer", ROOT / "deploy/runtime_observer.py")
assert SPEC and SPEC.loader
observer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(observer)


class RuntimeObserverTests(unittest.TestCase):
    def config(self):
        return SimpleNamespace(
            runtime_url="https://signal-api.virya.music",
            control_plane_url="http://127.0.0.1:8090/api/v1",
            tenant_slug="virya",
            telemetry_token="t" * 32,
            docker="docker",
        )

    def test_report_uses_runtime_meta_and_active_worker(self):
        responses = {
            "https://signal-api.virya.music/v1/health/ready": {"status": "ready"},
            "https://signal-api.virya.music/v1/meta": {
                "schemaVersion": 207,
                "gitSha": "a" * 40,
            },
        }
        completed = [
            subprocess.CompletedProcess([], 0, "healthy\n", ""),
            subprocess.CompletedProcess([], 1, "", "missing"),
        ]
        with (
            mock.patch.object(observer, "get_json", side_effect=lambda url: responses[url]),
            mock.patch.object(observer, "get_text", return_value=""),
            mock.patch.object(observer.subprocess, "run", side_effect=completed),
        ):
            report = observer.build_report(self.config())
        self.assertEqual(report["apiHealthy"], True)
        self.assertEqual(report["workerHealthy"], True)
        self.assertEqual(report["schemaVersion"], 207)
        self.assertEqual(report["deployedSha"], "a" * 40)

    def test_failed_api_probe_reports_degraded_without_stale_identity(self):
        completed = [
            subprocess.CompletedProcess([], 1, "", "missing"),
            subprocess.CompletedProcess([], 1, "", "missing"),
        ]
        with (
            mock.patch.object(observer, "get_json", side_effect=OSError("offline")),
            mock.patch.object(observer, "get_text", side_effect=OSError("offline")),
            mock.patch.object(observer.subprocess, "run", side_effect=completed),
        ):
            report = observer.build_report(self.config())
        self.assertEqual(report["apiHealthy"], False)
        self.assertEqual(report["workerHealthy"], False)
        self.assertNotIn("schemaVersion", report)
        self.assertNotIn("deployedSha", report)

    def test_outbox_pending_is_parsed_from_metrics(self):
        metrics = (
            "# HELP crowdrelay_outbox_pending Pending outbox messages\n"
            "# TYPE crowdrelay_outbox_pending gauge\n"
            "crowdrelay_outbox_pending 42\n"
        )
        completed = [
            subprocess.CompletedProcess([], 0, "healthy\n", ""),
            subprocess.CompletedProcess([], 1, "", "missing"),
        ]
        responses = {
            "https://signal-api.virya.music/v1/health/ready": {"status": "ready"},
            "https://signal-api.virya.music/v1/meta": {"schemaVersion": 207, "gitSha": "a" * 40},
        }
        with (
            mock.patch.object(observer, "get_json", side_effect=lambda url: responses[url]),
            mock.patch.object(observer, "get_text", return_value=metrics),
            mock.patch.object(observer.subprocess, "run", side_effect=completed),
        ):
            report = observer.build_report(self.config())
        self.assertEqual(report.get("outboxPending"), 42)

    def test_docker_timeout_reports_worker_unhealthy(self):
        with mock.patch.object(
            observer.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired("docker", 5),
        ):
            self.assertEqual(observer.worker_healthy(self.config()), False)

    def test_observe_once_sends_the_built_report(self):
        report = {"apiHealthy": True, "workerHealthy": True, "lastHeartbeatAt": "now"}
        with (
            mock.patch.object(observer, "build_report", return_value=report),
            mock.patch.object(observer, "send_report") as send,
        ):
            self.assertIs(observer.observe_once(self.config()), report)
        send.assert_called_once_with(mock.ANY, report)


if __name__ == "__main__":
    unittest.main()
