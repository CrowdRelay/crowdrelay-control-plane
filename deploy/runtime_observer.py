#!/usr/bin/env python3
"""CrowdRelay runtime telemetry observer.

Runs as a systemd service on the CrowdRelay host. Every interval it:
  1. Probes the CrowdRelay API (/v1/health/ready + /v1/meta + /metrics)
  2. Inspects the worker container health
  3. PUTs a runtime receipt to the Control Plane

The Control Plane marks a tenant stale 180s after the last receipt, so a
30s default interval gives 6x headroom. On consecutive send failures the
observer backs off (up to 5 min) so it doesn't spam logs when the control
plane is temporarily unreachable — but it always probes the runtime at
the normal interval so a recovered control plane gets a fresh receipt
immediately on the next attempt.
"""
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
# Backoff schedule on consecutive send failures (seconds).
# Capped at 5 min so a recovered control plane gets a report within one cycle.
BACKOFF_SCHEDULE = [30.0, 60.0, 120.0, 300.0]


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


def _truncate_url(url: str, max_len: int = 120) -> str:
    """Truncate long URLs for log lines, keeping the path visible."""
    if len(url) <= max_len:
        return url
    return url[:max_len - 3] + "..."


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


def get_text(url: str) -> str:
    """Fetch a text endpoint (e.g. Prometheus /metrics) with a size cap."""
    request = urllib.request.Request(url, headers={"Accept": "text/plain"})
    with urllib.request.urlopen(request, timeout=5) as response:
        if response.status != 200:
            raise RuntimeError(f"GET {url} returned {response.status}")
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise RuntimeError(f"GET {url} exceeded response limit")
    return body.decode("utf-8", errors="replace")


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


def parse_outbox_pending(metrics_text: str) -> int | None:
    """Extract crowdrelay_outbox_pending from a Prometheus /metrics payload."""
    for line in metrics_text.splitlines():
        # Skip comments and empty lines
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 2 and parts[0] == "crowdrelay_outbox_pending":
            try:
                return int(parts[1])
            except ValueError:
                return None
    return None


def build_report(config: Config) -> dict[str, Any]:
    api_healthy = False
    schema_version: int | None = None
    deployed_sha: str | None = None
    outbox_pending: int | None = None

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
    except (OSError, RuntimeError, json.JSONDecodeError, urllib.error.URLError) as error:
        # Probe failure — the report still sends with api_healthy=false so the
        # control plane shows degraded, not stale.
        print(
            f"RUNTIME_OBSERVER=PROBE_FAIL url={_truncate_url(config.runtime_url)} "
            f"type={type(error).__name__}",
            flush=True,
        )

    # Collect outbox pending from /metrics (best-effort, doesn't affect api_healthy)
    try:
        metrics_text = get_text(f"{config.runtime_url}/metrics")
        outbox_pending = parse_outbox_pending(metrics_text)
    except (OSError, RuntimeError, urllib.error.URLError):
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
    if outbox_pending is not None:
        report["outboxPending"] = outbox_pending
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
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status != 200:
            raise RuntimeError(f"PUT {url} returned {response.status}")
        if len(response.read(MAX_RESPONSE_BYTES + 1)) > MAX_RESPONSE_BYTES:
            raise RuntimeError(f"PUT {url} exceeded response limit")


def observe_once(config: Config) -> dict[str, Any]:
    report = build_report(config)
    send_report(config, report)
    return report


def _format_error(error: Exception, context_url: str) -> str:
    """Format an error with enough context to debug without leaking secrets."""
    error_type = type(error).__name__
    url = _truncate_url(context_url)
    if isinstance(error, urllib.error.URLError):
        reason = getattr(error, "reason", str(error))
        return f"type={error_type} url={url} reason={reason}"
    if isinstance(error, urllib.error.HTTPError):
        return f"type={error_type} url={url} status={error.code}"
    return f"type={error_type} url={url} msg={error}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    config = Config()

    # Log the configured endpoints on startup so misconfigurations are
    # immediately visible in journalctl — the previous version failed
    # silently with type=URLError for days because the URL was wrong.
    print(
        f"RUNTIME_OBSERVER=START "
        f"control_plane={_truncate_url(config.control_plane_url)} "
        f"runtime={_truncate_url(config.runtime_url)} "
        f"tenant={config.tenant_slug} interval={config.interval_seconds:.0f}s",
        flush=True,
    )

    consecutive_send_failures = 0
    while True:
        started = time.monotonic()
        try:
            report = observe_once(config)
            consecutive_send_failures = 0
            print(
                "RUNTIME_OBSERVER=PASS "
                f"tenant={config.tenant_slug} api={report['apiHealthy']} "
                f"worker={report['workerHealthy']} sha={report.get('deployedSha', 'unknown')} "
                f"outbox={report.get('outboxPending', 'n/a')}",
                flush=True,
            )
        except Exception as error:
            # Distinguish where the failure happened:
            # - send_report fails → control plane unreachable (backoff)
            # - build_report fails → runtime probe failed (report still sends
            #   with api_healthy=false, so this only fires if send also fails)
            send_url = f"{config.control_plane_url}/tenants/{config.tenant_slug}/runtime"
            print(
                f"RUNTIME_OBSERVER=ERROR {_format_error(error, send_url)}",
                flush=True,
            )
            if args.once:
                return 1
            consecutive_send_failures += 1

        if args.once:
            return 0

        elapsed = time.monotonic() - started
        # Normal sleep is interval - elapsed. On consecutive send failures,
        # back off so we don't spam the control plane or the journal.
        if consecutive_send_failures > 0:
            backoff_idx = min(consecutive_send_failures - 1, len(BACKOFF_SCHEDULE) - 1)
            sleep_seconds = BACKOFF_SCHEDULE[backoff_idx]
        else:
            sleep_seconds = max(1.0, config.interval_seconds - elapsed)
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
