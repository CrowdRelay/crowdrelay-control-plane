#!/usr/bin/env python3
"""Ensure every shipped tenant-operations upstream call survives the transport allowlist."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
ROUTES = (ROOT / "crates/control-plane-api/src/operations_routes.rs").read_text(encoding="utf-8")
CLIENT = (ROOT / "crates/control-plane-api/src/tenant_area_client.rs").read_text(encoding="utf-8")


class OperationsTransportAllowlistContract(unittest.TestCase):
    def test_every_shipped_upstream_path_is_represented_in_allowlist(self) -> None:
        allowlist = CLIENT.split("fn valid_operations_request", 1)[1].split("\nfn ", 1)[0]

        static_paths = set(re.findall(r'"(/v1/control-plane/[^"{]+)"', ROUTES))
        dynamic_prefixes = {
            prefix
            for prefix in re.findall(r'format!\("(/v1/control-plane/[^"{]+)\{', ROUTES)
        }

        self.assertTrue(static_paths, "no static upstream paths found in operations_routes.rs")
        for path in sorted(static_paths):
            self.assertIn(
                f'"{path}"',
                allowlist,
                f"upstream path is not represented in valid_operations_request: {path}",
            )

        for prefix in sorted(dynamic_prefixes):
            if f'"{prefix}' in allowlist:
                continue
            helper = re.search(
                rf"fn\s+([a-z_][a-z0-9_]*)\([^)]*\)[^{{]*\{{(?:(?!\nfn\s).)*{re.escape(prefix)}",
                CLIENT,
                flags=re.DOTALL,
            )
            self.assertIsNotNone(
                helper,
                f"dynamic upstream family has no allowlist helper: {prefix}",
            )
            helper_name = helper.group(1)
            self.assertIn(
                f"{helper_name}(path)",
                allowlist,
                f"allowlist helper for {prefix} is not invoked by valid_operations_request",
            )

    def test_allowlist_stays_fail_closed(self) -> None:
        allowlist = CLIENT.split("fn valid_operations_request", 1)[1].split("\nfn ", 1)[0]
        self.assertNotIn('path.starts_with("/v1/control-plane/ops/")', allowlist)
        self.assertNotIn('"/v1/admin/', allowlist)
        self.assertIn('"/v1/control-plane/ops/deliveries/dead/clear"', allowlist)


if __name__ == "__main__":
    unittest.main()
