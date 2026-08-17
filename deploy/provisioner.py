#!/usr/bin/env python3
"""Narrow CrowdRelay tenant provisioner.

The HTTP API owns desired state and audit. This host-side agent owns the only
Docker capability. It accepts a fixed schema, renders a fixed Compose stack,
and never executes shell text from a tenant or provisioning plan.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Any

SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
IMAGE = re.compile(r"^[a-zA-Z0-9./_-]+:[a-zA-Z0-9._-]+$")
SHA_TAG = re.compile(r"^sha-([0-9a-f]{40})$")
COUNTRY = re.compile(r"^[A-Z]{2}$")
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
PALETTE_KEYS = {"primary", "primaryContrast", "accent", "surface", "surfaceElevated", "text", "textMuted", "success", "warning", "danger"}
MAX_HTTP_BYTES = 2 * 1024 * 1024
CONTROL_PLANE_SECRET_ENV = {"CONTROL_PLANE_ADMIN_TOKEN", "CONTROL_PLANE_TELEMETRY_TOKEN", "CONTROL_PLANE_PROVISIONER_TOKEN"}


class ProvisionError(RuntimeError):
    def __init__(self, code: str, detail: str, *, terminal: bool = True):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.terminal = terminal


class Config:
    def __init__(self) -> None:
        self.api_url = os.environ.get(
            "CONTROL_PLANE_PROVISIONER_API_URL", "http://127.0.0.1:8090/api/v1"
        ).rstrip("/")
        self.token = os.environ.get("CONTROL_PLANE_PROVISIONER_TOKEN", "").strip()
        if len(self.token) < 32 or any(ch.isspace() for ch in self.token):
            raise SystemExit("CONTROL_PLANE_PROVISIONER_TOKEN must be a 32+ character secret")
        self.telemetry_token = os.environ.get("CONTROL_PLANE_TELEMETRY_TOKEN", "").strip()
        if len(self.telemetry_token) < 32 or any(ch.isspace() for ch in self.telemetry_token):
            raise SystemExit("CONTROL_PLANE_TELEMETRY_TOKEN must be provided to the provisioner observer")
        if self.telemetry_token == self.token:
            raise SystemExit("provisioner and telemetry tokens must differ")
        self.worker_id = os.environ.get(
            "CONTROL_PLANE_PROVISIONER_WORKER_ID", socket.gethostname()
        ).strip()
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{3,96}", self.worker_id):
            raise SystemExit("CONTROL_PLANE_PROVISIONER_WORKER_ID is invalid")
        self.root = Path(
            os.environ.get("CONTROL_PLANE_TENANT_ROOT", "/srv/crowdrelay-tenants")
        ).resolve()
        self.port_start = int(os.environ.get("CONTROL_PLANE_TENANT_PORT_START", "18100"))
        self.port_end = int(os.environ.get("CONTROL_PLANE_TENANT_PORT_END", "18999"))
        if not (1024 <= self.port_start <= self.port_end <= 65535):
            raise SystemExit("invalid tenant port range")
        self.poll_seconds = max(
            1.0, min(float(os.environ.get("CONTROL_PLANE_PROVISIONER_POLL_SECONDS", "3")), 60.0)
        )
        self.health_timeout = max(
            10, min(int(os.environ.get("CONTROL_PLANE_PROVISIONER_HEALTH_TIMEOUT_SECONDS", "120")), 600)
        )
        self.observer_seconds = max(
            10.0, min(float(os.environ.get("CONTROL_PLANE_PROVISIONER_OBSERVER_SECONDS", "30")), 300.0)
        )
        self.postgres_image = os.environ.get(
            "CONTROL_PLANE_PROVISIONER_POSTGRES_IMAGE", "postgres:18-alpine"
        ).strip()
        if not IMAGE.fullmatch(self.postgres_image) or self.postgres_image.endswith(":latest"):
            raise SystemExit("CONTROL_PLANE_PROVISIONER_POSTGRES_IMAGE must be a safe non-latest image reference")
        self.docker = os.environ.get("CONTROL_PLANE_PROVISIONER_DOCKER_BIN", "docker").strip()
        if not self.docker or any(ch.isspace() for ch in self.docker):
            raise SystemExit("CONTROL_PLANE_PROVISIONER_DOCKER_BIN must be one executable path")


def api_with_token(
    config: Config,
    token: str,
    method: str,
    path: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    request = urllib.request.Request(
        config.api_url + path,
        method=method,
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "crowdrelay-tenant-provisioner/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read(MAX_HTTP_BYTES + 1)
            if len(raw) > MAX_HTTP_BYTES:
                raise ProvisionError("control_plane_response_too_large", "Control Plane response exceeded 2 MiB")
            return json.loads(raw or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read(4096)
        try:
            body = json.loads(raw)
            detail = str(body.get("detail") or body.get("error") or f"HTTP {exc.code}")
        except Exception:
            detail = f"HTTP {exc.code}"
        raise ProvisionError(
            "control_plane_http_error",
            detail,
            terminal=exc.code < 500 and exc.code not in (408, 425, 429),
        ) from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise ProvisionError(
            "control_plane_unavailable", type(exc).__name__, terminal=False
        ) from exc


def api(config: Config, method: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    return api_with_token(config, config.token, method, path, payload)


def safe_https_origin(value: Any) -> bool:
    if not isinstance(value, str) or any(ch.isspace() or ord(ch) < 32 for ch in value):
        return False
    try:
        parsed = urllib.parse.urlsplit(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.hostname)
        and parsed.username is None
        and parsed.password is None
        and parsed.path in ("", "/")
        and not parsed.query
        and not parsed.fragment
    )


def safe_image_ref(value: Any, expected_tag: str) -> bool:
    if not isinstance(value, str) or not IMAGE.fullmatch(value):
        return False
    repository, separator, tag = value.rpartition(":")
    if not separator or tag != expected_tag:
        return False
    if repository.startswith(("/", ".")) or repository.endswith("/") or "//" in repository:
        return False
    segments = repository.split("/")
    return all(segment not in ("", ".", "..") for segment in segments)


def safe_plan(job: dict[str, Any]) -> dict[str, Any]:
    plan = job.get("plan")
    if not isinstance(plan, dict) or plan.get("schema") != 3 or plan.get("mode") != "local_docker_compose":
        raise ProvisionError("invalid_plan", "unsupported provisioning plan schema")
    slug = plan.get("tenantSlug")
    project = plan.get("composeProject")
    workspace_slug = plan.get("workspaceSlug")
    display_name = plan.get("displayName")
    country = plan.get("defaultCountryCode")
    api_image = plan.get("apiImage")
    worker_image = plan.get("workerImage")
    crowdrelay_base = plan.get("crowdRelayBaseUrl")
    public_site = plan.get("publicSiteBaseUrl")
    origins = plan.get("allowedOrigins")
    desired = plan.get("desiredVersion")
    palette = plan.get("brandingPalette")
    if not isinstance(slug, str) or not SLUG.fullmatch(slug):
        raise ProvisionError("invalid_plan", "invalid tenant slug")
    if project != f"crowdrelay-{slug}" or workspace_slug != slug:
        raise ProvisionError("invalid_plan", "compose/workspace identity mismatch")
    if (
        not isinstance(display_name, str)
        or not (2 <= len(display_name) <= 120)
        or any(ch in "\r\n\x00" for ch in display_name)
    ):
        raise ProvisionError("invalid_plan", "invalid display name")
    if not isinstance(country, str) or not COUNTRY.fullmatch(country):
        raise ProvisionError("invalid_plan", "invalid country code")
    if not isinstance(desired, str) or not SHA_TAG.fullmatch(desired):
        raise ProvisionError("invalid_plan", "deployment is not pinned to an immutable SHA")
    for value in (api_image, worker_image):
        if not safe_image_ref(value, desired):
            raise ProvisionError("invalid_plan", "invalid CrowdRelay image reference")
    if not safe_https_origin(crowdrelay_base):
        raise ProvisionError("invalid_plan", "CrowdRelay base URL must be a bare HTTPS origin")
    if not safe_https_origin(public_site):
        raise ProvisionError("invalid_plan", "public site URL must be a bare HTTPS origin")
    if not isinstance(origins, list) or not origins or any(
        not safe_https_origin(origin) for origin in origins
    ):
        raise ProvisionError("invalid_plan", "allowed origins are invalid")
    if palette is not None:
        if not isinstance(palette, dict) or set(palette) != PALETTE_KEYS:
            raise ProvisionError("invalid_plan", "branding palette shape is invalid")
        if any(not isinstance(value, str) or not HEX_COLOR.fullmatch(value) for value in palette.values()):
            raise ProvisionError("invalid_plan", "branding palette colors are invalid")
    return plan


def q(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_compose(plan: dict[str, Any], port: int, postgres_image: str) -> str:
    api_image = q(plan["apiImage"])
    worker_image = q(plan["workerImage"])
    postgres = q(postgres_image)
    return f'''services:
  postgres:
    image: {postgres}
    env_file: [.env, tenant.env]
    command: ["postgres", "-c", "io_method=worker", "-c", "io_workers=2"]
    volumes: ["postgres:/var/lib/postgresql"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${{POSTGRES_USER}} -d $${{POSTGRES_DB}}"]
      interval: 5s
      timeout: 3s
      retries: 30
    pids_limit: 256
    mem_limit: 384m
    cpus: 0.75
    restart: unless-stopped
    logging:
      driver: local
      options: {{max-size: "10m", max-file: "3"}}
  setup:
    image: {worker_image}
    command: ["setup"]
    env_file: [.env, tenant.env]
    volumes: ["./bootstrap.json:/run/crowdrelay/bootstrap.json:ro"]
    read_only: true
    tmpfs: ["/tmp:size=16m,mode=1777"]
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
    pids_limit: 64
    mem_limit: 256m
    cpus: 0.50
    restart: "no"
  api:
    image: {api_image}
    env_file: [.env, tenant.env]
    ports: ["127.0.0.1:{port}:8080"]
    healthcheck:
      test: ["CMD", "curl", "--fail", "--silent", "--show-error", "http://127.0.0.1:8080/v1/health/ready"]
      interval: 10s
      timeout: 3s
      retries: 12
      start_period: 15s
    init: true
    read_only: true
    tmpfs: ["/tmp:size=16m,mode=1777"]
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
    pids_limit: 128
    mem_limit: 256m
    cpus: 0.75
    restart: unless-stopped
    logging:
      driver: local
      options: {{max-size: "10m", max-file: "3"}}
  worker:
    image: {worker_image}
    command: ["run"]
    env_file: [.env, tenant.env]
    healthcheck:
      test: ["CMD-SHELL", "for executable in /proc/[0-9]*/exe; do target=$$(readlink \"$$executable\" 2>/dev/null || true); [ \"$$target\" = /usr/local/bin/crowdrelay-worker ] && exit 0; done; exit 1"]
      interval: 15s
      timeout: 3s
      retries: 8
      start_period: 20s
    init: true
    read_only: true
    tmpfs: ["/tmp:size=16m,mode=1777"]
    cap_drop: ["ALL"]
    security_opt: ["no-new-privileges:true"]
    pids_limit: 128
    mem_limit: 256m
    cpus: 0.50
    restart: unless-stopped
    logging:
      driver: local
      options: {{max-size: "10m", max-file: "3"}}
volumes:
  postgres:
'''


def create_secret_env(plan: dict[str, Any]) -> str:
    db_password = secrets.token_urlsafe(36)
    response_secret = secrets.token_urlsafe(48)
    admin_key = secrets.token_urlsafe(36)
    staff_key = secrets.token_urlsafe(36)
    qr_secret = secrets.token_urlsafe(48)
    values = {
        "POSTGRES_DB": "crowdrelay",
        "POSTGRES_USER": "crowdrelay",
        "POSTGRES_PASSWORD": db_password,
        "CROWDRELAY_DATABASE_URL": f"postgres://crowdrelay:{db_password}@postgres:5432/crowdrelay",
        "CROWDRELAY_RESPONSE_ENCRYPTION_SECRET": response_secret,
        "CROWDRELAY_ADMIN_API_KEY": admin_key,
        "CROWDRELAY_STAFF_API_KEY": staff_key,
        "CROWDRELAY_QR_SIGNING_SECRET": qr_secret,
    }
    return "".join(f"{key}={value}\n" for key, value in values.items())


def create_runtime_env(plan: dict[str, Any]) -> str:
    origins = ",".join(plan["allowedOrigins"])
    values = {
        "CROWDRELAY_ENV": "production",
        "CROWDRELAY_BIND_ADDR": "0.0.0.0:8080",
        "CROWDRELAY_DATABASE_MAX_CONNECTIONS": "5",
        "CROWDRELAY_DATABASE_CONNECT_TIMEOUT_MS": "5000",
        "CROWDRELAY_DATABASE_PING_TIMEOUT_MS": "2000",
        "CROWDRELAY_DATABASE_OPERATION_TIMEOUT_MS": "5000",
        "CROWDRELAY_DATABASE_LOCK_TIMEOUT_MS": "1000",
        "CROWDRELAY_ALLOWED_ORIGINS": origins,
        "CROWDRELAY_WORKSPACE_SLUG": plan["workspaceSlug"],
        "CROWDRELAY_TENANT_DISPLAY_NAME": plan["displayName"],
        "CROWDRELAY_PUBLIC_SITE_BASE_URL": plan["publicSiteBaseUrl"],
        "CROWDRELAY_DEFAULT_COUNTRY_CODE": plan["defaultCountryCode"],
        "CROWDRELAY_REDIRECT_REFRESH_INTERVAL_MS": "15000",
        "CROWDRELAY_CLICK_CHANNEL_CAPACITY": "2048",
        "CROWDRELAY_CLICK_BATCH_SIZE": "100",
        "CROWDRELAY_CLICK_FLUSH_INTERVAL_MS": "500",
        "CROWDRELAY_EVENT_REMINDER_OFFSETS_MINUTES": "1440,120",
        "CROWDRELAY_EVENT_REMINDER_POLL_INTERVAL_MS": "60000",
        "CROWDRELAY_AUTOPILOT_ENABLED": "false",
        "CROWDRELAY_AUTOPILOT_POLL_INTERVAL_MS": "60000",
        "CROWDRELAY_ADMIN_MEMBER_EMAIL": "admin@example.invalid",
        "CROWDRELAY_STAFF_MEMBER_EMAIL": "staff@example.invalid",
        "CROWDRELAY_QR_TTL_SECONDS": "30",
        "CROWDRELAY_REQUIRE_DOUBLE_OPT_IN": "true",
        "CROWDRELAY_RANDOM_DRAWS_ENABLED": "false",
        "CROWDRELAY_BOOTSTRAP_FILE": "/run/crowdrelay/bootstrap.json",
        "RUST_LOG": "info,crowdrelay=info",
    }
    palette = plan.get("brandingPalette")
    if isinstance(palette, dict):
        values.update({
            "CROWDRELAY_TENANT_COLOR_BACKGROUND": palette["surface"],
            "CROWDRELAY_TENANT_COLOR_SURFACE": palette["surfaceElevated"],
            "CROWDRELAY_TENANT_COLOR_MUTED": palette["textMuted"],
            "CROWDRELAY_TENANT_COLOR_ACCENT": palette["primary"],
            "CROWDRELAY_TENANT_COLOR_TEXT": palette["text"],
            "CROWDRELAY_TENANT_COLOR_DANGER": palette["danger"],
            "CROWDRELAY_TENANT_COLOR_SUCCESS": palette["success"],
        })
    return "".join(f"{key}={value}\n" for key, value in values.items())


def bootstrap(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "workspace_name": plan["displayName"],
        "cities": [],
        "campaigns": [],
        "webhook_endpoints": [],
        "reward_rules": [],
        "events": [],
        "admission_pools": [],
        "event_sources": [],
        "reward_draws": [],
    }


def port_in_use(port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", port))
        return False
    except OSError:
        return True
    finally:
        sock.close()


def allocated_ports(root: Path) -> set[int]:
    result: set[int] = set()
    if not root.exists():
        return result
    for path in root.glob("*/deployment.json"):
        try:
            value = json.loads(path.read_text(encoding="utf-8")).get("apiPort")
            if isinstance(value, int):
                result.add(value)
        except (OSError, json.JSONDecodeError):
            continue
    return result


def choose_port(config: Config, tenant_dir: Path) -> int:
    deployment = tenant_dir / "deployment.json"
    if deployment.exists():
        try:
            value = json.loads(deployment.read_text(encoding="utf-8")).get("apiPort")
            if isinstance(value, int) and config.port_start <= value <= config.port_end:
                for other in config.root.glob("*/deployment.json"):
                    if other.parent == tenant_dir:
                        continue
                    try:
                        if json.loads(other.read_text(encoding="utf-8")).get("apiPort") == value:
                            raise ProvisionError(
                                "port_allocation_conflict",
                                f"tenant port {value} is also claimed by {other.parent.name}",
                            )
                    except (OSError, json.JSONDecodeError):
                        continue
                return value
        except (OSError, json.JSONDecodeError):
            pass
    reserved = allocated_ports(config.root)
    for port in range(config.port_start, config.port_end + 1):
        if port not in reserved and not port_in_use(port):
            return port
    raise ProvisionError("port_pool_exhausted", "no free CrowdRelay tenant API port is available")


def write_once(path: Path, content: str, mode: int) -> None:
    if path.exists():
        return
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(path, flags, mode)
    try:
        os.write(fd, content.encode("utf-8"))
    finally:
        os.close(fd)


def prepare_files(config: Config, plan: dict[str, Any]) -> tuple[Path, int]:
    config.root.mkdir(parents=True, exist_ok=True, mode=0o750)
    lock_path = config.root / ".allocation.lock"
    lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        tenant_dir = (config.root / plan["tenantSlug"]).resolve()
        if tenant_dir.parent != config.root:
            raise ProvisionError("invalid_plan", "tenant root traversal rejected")
        tenant_dir.mkdir(mode=0o700, exist_ok=True)
        os.chmod(tenant_dir, 0o700)
        port = choose_port(config, tenant_dir)
        write_once(tenant_dir / ".env", create_secret_env(plan), 0o600)
        (tenant_dir / "tenant.env").write_text(create_runtime_env(plan), encoding="utf-8")
        os.chmod(tenant_dir / "tenant.env", 0o600)
        (tenant_dir / "bootstrap.json").write_text(
            json.dumps(bootstrap(plan), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        os.chmod(tenant_dir / "bootstrap.json", 0o644)
        (tenant_dir / "compose.yaml").write_text(
            render_compose(plan, port, config.postgres_image), encoding="utf-8"
        )
        os.chmod(tenant_dir / "compose.yaml", 0o644)
        deployment_path = tenant_dir / "deployment.json"
        try:
            deployment = json.loads(deployment_path.read_text(encoding="utf-8")) if deployment_path.exists() else {}
        except (OSError, json.JSONDecodeError):
            deployment = {}
        deployment.update({
            "schema": 1,
            "tenantSlug": plan["tenantSlug"],
            "composeProject": plan["composeProject"],
            "apiPort": port,
            "desiredVersion": plan["desiredVersion"],
            "crowdRelayBaseUrl": plan["crowdRelayBaseUrl"],
        })
        deployment_path.write_text(
            json.dumps(deployment, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        os.chmod(deployment_path, 0o644)
        return tenant_dir, port
    finally:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
        finally:
            os.close(lock_fd)


def docker_subprocess_env() -> dict[str, str]:
    child = {
        key: value
        for key, value in os.environ.items()
        if key not in CONTROL_PLANE_SECRET_ENV
    }
    child["COMPOSE_ANSI"] = "never"
    return child


def compose_cmd(config: Config, tenant_dir: Path, project: str, *args: str, timeout: int) -> str:
    command = [
        config.docker,
        "compose",
        "-p",
        project,
        "--env-file",
        str(tenant_dir / ".env"),
        "-f",
        str(tenant_dir / "compose.yaml"),
        *args,
    ]
    try:
        completed = subprocess.run(
            command,
            cwd=tenant_dir,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
            env=docker_subprocess_env(),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ProvisionError("docker_compose_unavailable", type(exc).__name__) from exc
    output = completed.stdout[-12000:]
    if completed.returncode != 0:
        print(output, file=sys.stderr)
        raise ProvisionError(
            "docker_compose_failed", f"docker compose {' '.join(args[:2])} failed with exit {completed.returncode}"
        )
    return output


def renew(config: Config, job_id: str, token: str) -> None:
    api(config, "POST", f"/provisioner/jobs/{job_id}/lease", {"workerId": config.worker_id, "claimToken": token})


def wait_http(port: int, timeout_seconds: int) -> None:
    deadline = time.monotonic() + timeout_seconds
    url = f"http://127.0.0.1:{port}/v1/health/ready"
    last = "unavailable"
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200:
                    return
                last = f"HTTP {response.status}"
        except Exception as exc:  # readiness loop intentionally retries transient network states
            last = type(exc).__name__
        time.sleep(2)
    raise ProvisionError("api_readiness_timeout", f"CrowdRelay API readiness timed out ({last})")


def query_postgres(config: Config, tenant_dir: Path, project: str, sql: str) -> str:
    output = compose_cmd(
        config,
        tenant_dir,
        project,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "crowdrelay",
        "-d",
        "crowdrelay",
        "-At",
        "-c",
        sql,
        timeout=30,
    )
    return output.strip().splitlines()[-1].strip() if output.strip() else ""


def process_claim(config: Config, claim: dict[str, Any]) -> None:
    job = claim.get("job")
    token = claim.get("claimToken")
    if not isinstance(job, dict) or not isinstance(token, str):
        raise ProvisionError("invalid_claim", "Control Plane returned an invalid claim")
    job_id = str(job.get("id") or "")
    plan = safe_plan(job)
    desired = plan["desiredVersion"]
    match = SHA_TAG.fullmatch(desired)
    assert match is not None
    deployed_sha = match.group(1)
    tenant_dir, port = prepare_files(config, plan)
    project = plan["composeProject"]
    print(f"PROVISION tenant={plan['tenantSlug']} job={job_id} version={desired} port={port}")
    renew(config, job_id, token)
    compose_cmd(config, tenant_dir, project, "pull", timeout=600)
    renew(config, job_id, token)
    compose_cmd(config, tenant_dir, project, "up", "-d", "postgres", timeout=120)
    compose_cmd(
        config,
        tenant_dir,
        project,
        "exec",
        "-T",
        "postgres",
        "sh",
        "-lc",
        "until pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"; do sleep 1; done",
        timeout=90,
    )
    renew(config, job_id, token)
    compose_cmd(config, tenant_dir, project, "run", "--rm", "setup", timeout=240)
    compose_cmd(config, tenant_dir, project, "up", "-d", "api", "worker", timeout=180)
    renew(config, job_id, token)
    wait_http(port, config.health_timeout)

    workspace_id = query_postgres(
        config,
        tenant_dir,
        project,
        f"SELECT id FROM workspaces WHERE slug='{plan['workspaceSlug']}' LIMIT 1;",
    )
    schema_version = query_postgres(
        config,
        tenant_dir,
        project,
        "SELECT COALESCE(max(version),0) FROM _sqlx_migrations WHERE success;",
    )
    if not re.fullmatch(r"[0-9a-f-]{36}", workspace_id):
        raise ProvisionError("workspace_probe_failed", "workspace UUID was not found after bootstrap")
    if not schema_version.isdigit():
        raise ProvisionError("schema_probe_failed", "schema version probe returned a non-integer")

    metadata = json.loads((tenant_dir / "deployment.json").read_text(encoding="utf-8"))
    metadata.update(
        {
            "workspaceId": workspace_id,
            "schemaVersion": int(schema_version),
            "deployedSha": deployed_sha,
            "jobId": job_id,
            "provisionerWorkerId": config.worker_id,
        }
    )
    (tenant_dir / "deployment.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    api(
        config,
        "POST",
        f"/provisioner/jobs/{job_id}/succeed",
        {
            "workerId": config.worker_id,
            "claimToken": token,
            "apiPort": port,
            "workspaceId": workspace_id,
            "schemaVersion": int(schema_version),
            "deployedSha": deployed_sha,
        },
    )
    print(f"PROVISION=PASS tenant={plan['tenantSlug']} workspace={workspace_id} schema={schema_version}")


def fail_claim(config: Config, claim: dict[str, Any], error: ProvisionError) -> None:
    job = claim.get("job") if isinstance(claim, dict) else None
    token = claim.get("claimToken") if isinstance(claim, dict) else None
    job_id = str(job.get("id") or "") if isinstance(job, dict) else ""
    if not job_id or not isinstance(token, str):
        return
    try:
        api(
            config,
            "POST",
            f"/provisioner/jobs/{job_id}/fail",
            {
                "workerId": config.worker_id,
                "claimToken": token,
                "errorCode": error.code,
                "errorDetail": error.detail[:1000],
            },
        )
    except ProvisionError as report_error:
        print(f"PROVISION_FAILURE_REPORT=FAIL code={report_error.code}", file=sys.stderr)


def claim_once(config: Config) -> bool:
    response = api(config, "POST", "/provisioner/jobs/claim", {"workerId": config.worker_id})
    claim = response.get("claim")
    if claim is None:
        return False
    if not isinstance(claim, dict):
        raise ProvisionError("invalid_claim", "claim response is not an object")
    try:
        process_claim(config, claim)
    except ProvisionError as error:
        state = "FAIL" if error.terminal else "RETRY"
        print(f"PROVISION={state} code={error.code} detail={error.detail}", file=sys.stderr)
        if error.terminal:
            fail_claim(config, claim, error)
    return True



def container_running(config: Config, tenant_dir: Path, project: str, service: str) -> bool:
    try:
        container_id = compose_cmd(
            config,
            tenant_dir,
            project,
            "ps",
            "--status",
            "running",
            "-q",
            service,
            timeout=15,
        ).strip()
        return bool(container_id)
    except ProvisionError:
        return False


def api_healthy(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/v1/health/ready", timeout=3) as response:
            return response.status == 200
    except Exception:
        return False


def observe_deployments(config: Config) -> None:
    if not config.root.exists():
        return
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for path in sorted(config.root.glob("*/deployment.json")):
        try:
            metadata = json.loads(path.read_text(encoding="utf-8"))
            slug = metadata.get("tenantSlug")
            project = metadata.get("composeProject")
            port = metadata.get("apiPort")
            schema = metadata.get("schemaVersion")
            deployed_sha = metadata.get("deployedSha")
            if not isinstance(slug, str) or not SLUG.fullmatch(slug):
                continue
            if project != f"crowdrelay-{slug}" or not isinstance(port, int):
                continue
            tenant_dir = path.parent
            api_ok = api_healthy(port)
            worker_ok = container_running(config, tenant_dir, project, "worker")
            payload: dict[str, Any] = {
                "apiHealthy": api_ok,
                "workerHealthy": worker_ok,
                "lastHeartbeatAt": now,
            }
            if isinstance(schema, int) and schema >= 0:
                payload["schemaVersion"] = schema
            if isinstance(deployed_sha, str) and re.fullmatch(r"[0-9a-f]{40}", deployed_sha):
                payload["deployedSha"] = deployed_sha
            api_with_token(
                config,
                config.telemetry_token,
                "PUT",
                f"/tenants/{slug}/runtime",
                payload,
            )
        except (OSError, json.JSONDecodeError, ProvisionError) as exc:
            print(f"PROVISIONER_OBSERVER=ERROR file={path.name} error={type(exc).__name__}", file=sys.stderr)

def validate(config: Config) -> None:
    config.root.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        [config.docker, "compose", "version"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
        timeout=15,
        env=docker_subprocess_env(),
    )
    if completed.returncode != 0:
        raise SystemExit("docker compose is unavailable")
    print(
        "CONTROL_PLANE_PROVISIONER_VALIDATE=PASS "
        f"worker={config.worker_id} root={config.root} ports={config.port_start}-{config.port_end}"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="claim at most one job")
    parser.add_argument("--validate", action="store_true", help="validate local Docker capability and exit")
    args = parser.parse_args()
    config = Config()
    if args.validate:
        validate(config)
        return 0
    next_observation = 0.0
    while True:
        try:
            claimed = claim_once(config)
        except ProvisionError as error:
            print(f"PROVISIONER_LOOP=ERROR code={error.code} detail={error.detail}", file=sys.stderr)
            claimed = False
        if args.once:
            return 0
        now = time.monotonic()
        if now >= next_observation:
            observe_deployments(config)
            next_observation = now + config.observer_seconds
        if not claimed:
            time.sleep(config.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
