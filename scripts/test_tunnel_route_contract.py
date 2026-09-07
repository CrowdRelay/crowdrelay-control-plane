#!/usr/bin/env python3
"""Keep the two sources of truth for management routes in sync.

The control plane proxies management calls to CrowdRelay directly via
tenant_area_client.rs — no intermediate Caddy proxy. Two things must agree
on which routes are allowed:

  1. CrowdRelay's router (`control_plane.rs`) — defines the actual routes.
  2. The control plane's `valid_operations_request` in
     `tenant_area_client.rs` — the Rust allowlist that gates which
     paths the control plane will even attempt to proxy.

When these drift, the symptom is a 404 on a feature that should work —
the call is rejected at a layer the operator can't see. This test checks
that:

  - Every `/v1/control-plane/` path the backend calls (in
    `operations_routes.rs`) is present in `valid_operations_request`
    for the correct HTTP method.
  - Every concrete path in `valid_operations_request` is a real route
    in CrowdRelay's router (if the CrowdRelay checkout is present).
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CROWDRELAY_ROOT = ROOT.parent / "crowdrelay"

TENANT_AREA_CLIENT = ROOT / "crates" / "control-plane-api" / "src" / "tenant_area_client.rs"
OPERATIONS_ROUTES = ROOT / "crates" / "control-plane-api" / "src" / "operations_routes.rs"

CROWDRELAY_ROUTER = CROWDRELAY_ROOT / "crates" / "crowdrelay-api" / "src" / "control_plane.rs"


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


def extract_router_paths(text: str) -> set[str]:
    """Extract /v1/control-plane/ paths from the CrowdRelay router source."""
    return set(re.findall(r'"/(v1/control-plane/[a-z0-9/_{}*-]+)"', text))


def router_covers(router_paths: set[str], path: str) -> bool:
    """Check if a concrete path is covered by the router path set.

    router_paths entries don't have a leading / (the regex strips it).
    Routes may use {param} placeholders (e.g. `audience/fans/{fan_id}`).
    The Rust allowlist uses trailing `/` to mean "any sub-path under
    this prefix" — we check if any router path starts with that prefix.
    """
    # Strip query string and leading /
    base = path.split("?", 1)[0].lstrip("/")
    if base in router_paths:
        return True
    # Trailing / means "any sub-path" — check if any route starts with this prefix
    if base.endswith("/"):
        prefix = base.rstrip("/")
        for candidate in router_paths:
            if candidate.startswith(prefix + "/") or candidate == prefix:
                return True
        return False
    # Check wildcard coverage
    for candidate in router_paths:
        if candidate.endswith("/*") and base.startswith(candidate[:-1]):
            return True
    return False


class ManagementRouteContract(unittest.TestCase):
    def test_tenant_area_client_exists(self) -> None:
        self.assertTrue(TENANT_AREA_CLIENT.exists(), f"missing {TENANT_AREA_CLIENT}")

    def test_operations_routes_exists(self) -> None:
        self.assertTrue(OPERATIONS_ROUTES.exists(), f"missing {OPERATIONS_ROUTES}")

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

    def test_rust_allowlist_paths_are_in_crowdrelay_router(self) -> None:
        """Every concrete path in valid_operations_request must be a real CrowdRelay route.

        Only checked if the CrowdRelay checkout is present. The CrowdRelay
        router registers routes across nine files merged into routing.rs, so
        we scan the full crates/crowdrelay-api/src tree for path strings.
        """
        if not CROWDRELAY_ROUTER.exists():
            self.skipTest("CrowdRelay checkout not present")
        text = TENANT_AREA_CLIENT.read_text()
        allowlist = extract_rust_allowlist(text)
        # Gather all route strings from the CrowdRelay API source tree.
        api_src = CROWDRELAY_ROOT / "crates" / "crowdrelay-api" / "src"
        all_source = ""
        for rs in api_src.rglob("*.rs"):
            all_source += rs.read_text(encoding="utf-8")
        router_paths = extract_router_paths(all_source)
        self.assertTrue(router_paths, "no paths found in CrowdRelay API source")

        missing: list[str] = []
        for method, paths in allowlist.items():
            for path in paths:
                if not router_covers(router_paths, path):
                    missing.append(f"{method} {path}")
        self.assertEqual(
            missing,
            [],
            f"Rust allowlist has paths not in CrowdRelay router (will 404 at API): {missing}",
        )


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=0).result
    if result.wasSuccessful():
        print("TUNNEL_ROUTE_CONTRACT=PASS")
    else:
        print("TUNNEL_ROUTE_CONTRACT=FAIL")
        sys.exit(1)
