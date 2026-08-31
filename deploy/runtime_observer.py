#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

SHA = re.compile(r"^[0-9a-f]{40}$")
MAX_RESPONSE_BYTES = 64 * 1024


class Config:
    def __init__(self) -> None:
        self.control_plane_url = os.environ.get(
            "CONTROL_PLANE_RUNTIME_API_URL", "http://127.0.0.1:8090/api/v1"
        ).rstrip("/")
        self.telemetry_token = os.environ.get("CONTROL_PLANE_TELEMETRY_TOKEN", "").strip()
        self.tenant_slug = os.environ.get("CONTROL_PLANE_RUNTIME_TENANT", "virya").strip()
        self.runtime_url = os.environ.get(
            "CROWDRELAY_RUNTIME_URL", "https://signal-api.virya.music"
        ).rstrip("/")
        self.interval_seconds = max(
            10.0, min(float(os.environ.get("CONTROL_PLANE_RUNTIME_INTERVAL_SECONDS", "30")), 300.0)
        )
        self.docker = os.environ.get("CONTROL_PLANE_RUNTIME_DOCKER_BIN", "docker").strip()
        if len(self.telemetry_token) < 32 or any(ch.isspace() for ch in self.telemetry_token):
            raise SystemExit("CONTROL_PLANE_TELEMETRY_TOKEN must be a 32+ character secret")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,62}", self.tenant_slug):
            raise SystemExit("CONTROL_PLANE_RUNTIME_TENANT is invalid")
        if not self.docker or any(ch.isspace() for ch in self.docker):
            raise SystemExit("CONTROL_PLANE_RUNTIME_DOCKER_BIN must be one executable path")


def get_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=5) as response:
        if response.status != 200:
            raise RuntimeError(f"GET {url} returned {response.status}")
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise RuntimeError(f"GET {url} exceeded response limit")
    value = json.loads(body)
    if not isinstance(value, dict):
        raise RuntimeError(f"GET {url} did not return an object")
    return value


def worker_healthy(config: Config) -> bool:
    healthy = 0
    for container in ("crowdrelay-worker-1", "crowdrelay-worker-green-1"):
        try:
            result = subprocess.run(
                [
                    config.docker,
                    "inspect",
                    container,
                    "--format",
                    "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
                ],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
        except (OSError, subprocess.SubprocessError):
            continue
        if result.returncode == 0 and result.stdout.strip() in {"healthy", "running"}:
            healthy += 1
    return healthy >= 1


def build_report(config: Config) -> dict[str, Any]:
    api_healthy = False
    schema_version: int | None = None
    deployed_sha: str | None = None
    try:
        get_json(f"{config.runtime_url}/v1/health/ready")
        meta = get_json(f"{config.runtime_url}/v1/meta")
        api_healthy = True
        schema = meta.get("schemaVersion")
        sha = meta.get("gitSha")
        if isinstance(schema, int) and schema >= 0:
            schema_version = schema
        if isinstance(sha, str) and SHA.fullmatch(sha):
            deployed_sha = sha
    except (OSError, RuntimeError, json.JSONDecodeError, urllib.error.URLError):
        pass

    report: dict[str, Any] = {
        "apiHealthy": api_healthy,
        "workerHealthy": worker_healthy(config),
        "lastHeartbeatAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    if schema_version is not None:
        report["schemaVersion"] = schema_version
    if deployed_sha is not None:
        report["deployedSha"] = deployed_sha
    return report


def send_report(config: Config, report: dict[str, Any]) -> None:
    url = f"{config.control_plane_url}/tenants/{config.tenant_slug}/runtime"
    request = urllib.request.Request(
        url,
        method="PUT",
        data=json.dumps(report, separators=(",", ":")).encode(),
        headers={
            "Authorization": f"Bearer {config.telemetry_token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        if response.status != 200:
            raise RuntimeError(f"PUT {url} returned {response.status}")
        if len(response.read(MAX_RESPONSE_BYTES + 1)) > MAX_RESPONSE_BYTES:
            raise RuntimeError(f"PUT {url} exceeded response limit")


def observe_once(config: Config) -> dict[str, Any]:
    report = build_report(config)
    send_report(config, report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    config = Config()
    while True:
        started = time.monotonic()
        try:
            report = observe_once(config)
            print(
                "RUNTIME_OBSERVER=PASS "
                f"tenant={config.tenant_slug} api={report['apiHealthy']} "
                f"worker={report['workerHealthy']} sha={report.get('deployedSha', 'unknown')}",
                flush=True,
            )
        except Exception as error:
            print(f"RUNTIME_OBSERVER=ERROR type={type(error).__name__}", flush=True)
            if args.once:
                return 1
        if args.once:
            return 0
        elapsed = time.monotonic() - started
        time.sleep(max(1.0, config.interval_seconds - elapsed))


if __name__ == "__main__":
    raise SystemExit(main())
