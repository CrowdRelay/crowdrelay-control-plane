#!/usr/bin/env python3
"""Keep the four sources of truth for tunnel routes in sync.

The control plane proxies management calls to CrowdRelay through the
area tunnel. Four things must agree on which routes are allowed:

  1. CrowdRelay's router (`control_plane.rs`) — defines the actual routes.
  2. CrowdRelay's `area-management.Caddyfile` — the Caddy proxy that
     CrowdRelay runs on its side of the tunnel.
  3. The control plane's `virya-area-tunnel.Caddyfile` — the Caddy proxy
     on the control plane side.
  4. The control plane's `valid_operations_request` in
     `tenant_area_client.rs` — the Rust allowlist that gates which
     paths the control plane will even attempt to proxy.

When any one of these drifts, the symptom is a 404 on a feature that
should work — the call is rejected at a layer the operator can't see.
This test checks that:

  - Every concrete path in `valid_operations_request` is covered by the
    tunnel Caddyfile.
  - Every `/v1/control-plane/` path the backend calls (in
    `operations_routes.rs`) is present in `valid_operations_request`
    for the correct HTTP method.
  - Every path in the tunnel Caddyfile is covered by the area-management
    Caddyfile (if the CrowdRelay checkout is present).
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CROWDRELAY_ROOT = ROOT.parent / "crowdrelay"

TUNNEL_CADDYFILE = ROOT / "deploy" / "virya-area-tunnel.Caddyfile"
TENANT_AREA_CLIENT = ROOT / "crates" / "control-plane-api" / "src" / "tenant_area_client.rs"
OPERATIONS_ROUTES = ROOT / "crates" / "control-plane-api" / "src" / "operations_routes.rs"

AREA_MANAGEMENT_CADDYFILE = CROWDRELAY_ROOT / "deploy" / "area-management.Caddyfile"
CROWDRELAY_ROUTER = CROWDRELAY_ROOT / "crates" / "crowdrelay-api" / "src" / "control_plane.rs"


def extract_caddy_paths(text: str) -> set[str]:
    """Extract /v1/control-plane/ paths from a Caddyfile path matcher.

    Captures both concrete paths and wildcard paths (ending in /*).
    """
    return set(re.findall(r"/v1/control-plane/[a-z0-9/_*-]+", text))


def caddy_covers(tunnel_paths: set[str], path: str) -> bool:
    """Check if a concrete path is covered by the Caddy path set.

    A path is covered if it appears verbatim, or if a wildcard entry
    (ending in /*) covers it as a prefix.
    """
    if path in tunnel_paths:
        return True
    # Strip query string
    base = path.split("?", 1)[0]
    if base in tunnel_paths:
        return True
    return any(
        candidate.endswith("/*") and base.startswith(candidate[:-1])
        for candidate in tunnel_paths
    )


def extract_rust_allowlist(text: str) -> dict[str, set[str]]:
    """Extract concrete paths from valid_operations_request by method.

    Returns {method: {path, ...}} for the `matches!` arms and the
    `path == "..."` patterns. Dynamic patterns (uuid_segment_between,
    one_safe_segment, etc.) are not extracted — they are checked
    separately by the Rust unit tests.
    """
    result: dict[str, set[str]] = {}
    for method in ("GET", "POST", "DELETE"):
        # Find the method block
        method_pattern = rf'"({method})" => \{{'
        method_match = re.search(method_pattern, text)
        if not method_match:
            continue
        # Extract from the method block to the next method or closing brace
        start = method_match.end()
        # Find the next `"METHOD" =>` or the end of valid_operations_request
        next_method = re.search(r'"(?:GET|POST|DELETE|PUT|PATCH)" => \{', text[start:])
        end = start + next_method.start() if next_method else text.index("_ => false", start)
        block = text[start:end]
        # Extract from matches! arms
        paths = set(re.findall(r'"(/v1/control-plane/[^"]+)"', block))
        result[method] = paths
    return result


def extract_backend_calls(text: str) -> set[tuple[str, str]]:
    """Extract (method, path) pairs from call() invocations in operations_routes.rs.

    Looks for patterns like:
        "GET",
        "/v1/control-plane/ops/summary",
    """
    calls: set[tuple[str, str]] = set()
    # Match method + path pairs in call() arguments
    pattern = r'"(GET|POST|PUT|DELETE|PATCH)",\s*"(\/v1\/control-plane/[^"]+)"'
    for method, path in re.findall(pattern, text):
        calls.add((method, path))
    return calls


class TunnelRouteContract(unittest.TestCase):
    def test_tunnel_caddyfile_exists(self) -> None:
        self.assertTrue(TUNNEL_CADDYFILE.exists(), f"missing {TUNNEL_CADDYFILE}")

    def test_tenant_area_client_exists(self) -> None:
        self.assertTrue(TENANT_AREA_CLIENT.exists(), f"missing {TENANT_AREA_CLIENT}")

    def test_operations_routes_exists(self) -> None:
        self.assertTrue(OPERATIONS_ROUTES.exists(), f"missing {OPERATIONS_ROUTES}")

    def test_rust_allowlist_paths_are_in_tunnel_caddyfile(self) -> None:
        """Every concrete path in valid_operations_request must be in the tunnel Caddyfile."""
        text = TENANT_AREA_CLIENT.read_text()
        allowlist = extract_rust_allowlist(text)
        tunnel_paths = extract_caddy_paths(TUNNEL_CADDYFILE.read_text())
        self.assertTrue(tunnel_paths, "no paths found in tunnel Caddyfile")

        missing: list[str] = []
        for method, paths in allowlist.items():
            for path in paths:
                if not caddy_covers(tunnel_paths, path):
                    missing.append(f"{method} {path}")
        self.assertEqual(
            missing,
            [],
            f"Rust allowlist has paths not in tunnel Caddyfile (will 404 at Caddy): {missing}",
        )

    def test_backend_calls_are_in_rust_allowlist(self) -> None:
        """Every backend call() to /v1/control-plane/ must be in the Rust allowlist."""
        text = TENANT_AREA_CLIENT.read_text()
        allowlist = extract_rust_allowlist(text)
        backend_calls = extract_backend_calls(OPERATIONS_ROUTES.read_text())
        self.assertTrue(backend_calls, "no backend calls found in operations_routes.rs")

        missing: list[str] = []
        for method, path in backend_calls:
            if path not in allowlist.get(method, set()):
                missing.append(f"{method} {path}")
        self.assertEqual(
            missing,
            [],
            f"Backend calls not in Rust allowlist (will be rejected by valid_operations_request): {missing}",
        )

    def test_tunnel_caddyfile_paths_are_in_area_management(self) -> None:
        """Every path in the tunnel Caddyfile must be in the area-management Caddyfile.

        Only checked if the CrowdRelay checkout is present.
        """
        if not AREA_MANAGEMENT_CADDYFILE.exists():
            self.skipTest("CrowdRelay checkout not present")
        tunnel_paths = extract_caddy_paths(TUNNEL_CADDYFILE.read_text())
        area_paths = extract_caddy_paths(AREA_MANAGEMENT_CADDYFILE.read_text())
        self.assertTrue(area_paths, "no paths found in area-management Caddyfile")

        missing = sorted(tunnel_paths - area_paths)
        # Some paths may be covered by wildcards in the area-management Caddyfile
        truly_missing = [p for p in missing if not caddy_covers(area_paths, p)]
        self.assertEqual(
            truly_missing,
            [],
            f"Tunnel Caddyfile has paths not in area-management Caddyfile (will 404 at CrowdRelay): {truly_missing}",
        )


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=0).result
    if result.wasSuccessful():
        print("TUNNEL_ROUTE_CONTRACT=PASS")
    else:
        print("TUNNEL_ROUTE_CONTRACT=FAIL")
        sys.exit(1)
