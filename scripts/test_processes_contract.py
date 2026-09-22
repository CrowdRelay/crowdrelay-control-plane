"""Process-run read model proxy contract across all four layers.

A process view crosses the same four gates as every tenant-scoped call, and
each gate carries its own path list:

  1. control plane route            -> /tenants/{slug}/operations/processes/relays[/{source_id}]
  2. control plane proxy allowlist  -> tenant_area_client::valid_operations_request
  3. AREA tunnel Caddyfile          -> the @operations matcher, else `respond 404`
  4. crowdrelay route + authority   -> control_plane.rs under the /v1/control-plane/ prefix

The community-intelligence surface already proved the failure mode: a route
missing from any one layer answers 404 or "invalid tenant operations request"
while every other layer looks correct. This gate asserts all four agree for
the relay process reads.
"""

from __future__ import annotations

import os
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Same override the tunnel contract carries — a worktree or differently-named
# checkout pins which crowdrelay copy the four layers verify against.
CROWDRELAY = Path(os.environ.get("CROWDRELAY_ROOT", ROOT.parent / "crowdrelay"))

OPERATIONS_ROUTES = ROOT / "crates/control-plane-api/src/operations_routes.rs"
AREA_CLIENT = ROOT / "crates/control-plane-api/src/tenant_area_client.rs"
CADDYFILE = CROWDRELAY / "deploy/area-management.Caddyfile"
CONTROL_PLANE_ROUTES = CROWDRELAY / "crates/crowdrelay-api/src/control_plane.rs"
LIB = CROWDRELAY / "crates/crowdrelay-api/src/lib.rs"

BASE = "/v1/control-plane/processes/relays"
MANUAL = "/v1/control-plane/community-posts/"
BATCH = "/v1/control-plane/autopilot/community-relays/"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class ControlPlaneSide(unittest.TestCase):
    def test_routes_are_registered(self) -> None:
        source = read(OPERATIONS_ROUTES)
        self.assertIn("/tenants/{slug}/operations/processes/relays", source)
        self.assertIn(
            "/tenants/{slug}/operations/processes/relays/{source_id}", source
        )
        self.assertIn(
            "/tenants/{slug}/operations/community-posts/{post_id}/register-manual",
            source,
        )
        # The batch ask's two answers — one approval per source, one revoke.
        self.assertIn(
            "/tenants/{slug}/operations/community-relays/{source_id}/approve",
            source,
        )
        self.assertIn(
            "/tenants/{slug}/operations/community-relays/{source_id}/revoke",
            source,
        )

    def test_proxy_allowlist_covers_both_paths(self) -> None:
        """The allowlist is the third place a route must be added — a literal
        arm for the list and a uuid-bounded segment for the detail."""
        source = read(AREA_CLIENT)
        self.assertIn(f'"{BASE}"', source)
        self.assertIn(f'"{BASE}/"', source)

    def test_detail_segment_is_uuid_bounded(self) -> None:
        """A loose starts_with would forward any tail; the segment helper
        constrains the detail path to a uuid like its trace sibling."""
        source = read(AREA_CLIENT)
        self.assertIn(f'uuid_segment_between(path, "{BASE}/", "")', source)

    def test_manual_post_registration_is_allowlisted(self) -> None:
        """The process page's manual leg is a POST — without the arm entry
        the write is refused before it leaves the control plane."""
        source = read(AREA_CLIENT)
        self.assertIn('"/register-manual"', source)
        self.assertIn(f'"{MANUAL}"', source)

    def test_batch_mutations_are_allowlisted(self) -> None:
        """One approval per source: approve releases the spread to the drip,
        revoke cancels what has not landed — both POST arms must exist or the
        card's answers refuse before leaving the control plane."""
        source = read(AREA_CLIENT)
        self.assertIn(f'"{BATCH}"', source)
        self.assertIn('"/approve"', source)
        self.assertIn('"/revoke"', source)


@unittest.skipUnless(CROWDRELAY.is_dir(), "crowdrelay checkout not present")
class CrowdRelaySide(unittest.TestCase):
    def test_tunnel_matcher_forwards_both_paths(self) -> None:
        """Without an @operations entry the tunnel answers 404 before the
        request reaches the API."""
        source = read(CADDYFILE)
        self.assertIn(f" {BASE}", source)
        self.assertIn(f" {BASE}/*", source)
        # The manual-registration write rides the community-posts prefix the
        # tunnel already carries.
        self.assertIn(" /v1/control-plane/community-posts/*", source)
        # The batch ask's answers ride the community-relays prefix.
        self.assertIn(" /v1/control-plane/autopilot/community-relays/*", source)

    def test_routes_are_registered_under_control_plane(self) -> None:
        source = read(CONTROL_PLANE_ROUTES)
        self.assertIn(f'"{BASE}"', source)
        self.assertIn(f'"{BASE}/{{source_id}}"', source)
        self.assertIn(f'"{BATCH}{{source_id}}/approve"', source)
        self.assertIn(f'"{BATCH}{{source_id}}/revoke"', source)

    def test_authority_layer_is_a_prefix_grant(self) -> None:
        """The paths inherit ControlPlane authority from the namespace prefix —
        assert the boundary is still a prefix, not a per-path list that would
        need a hand-added entry."""
        source = read(LIB)
        start = source.index("fn is_control_plane_management_path(")
        body = source[start : source.index("\n}", start)]
        self.assertIn('path.starts_with("/v1/control-plane/")', body)


if __name__ == "__main__":
    unittest.main()
