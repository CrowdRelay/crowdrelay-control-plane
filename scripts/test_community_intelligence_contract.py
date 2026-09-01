"""Community Intelligence proxy contract across all four layers.

The panel read "not found" for every tenant because the three endpoints were
built under `/v1/admin/`, and reaching a tenant runtime crosses four gates that
each carry their own path list:

  1. control plane route            -> /tenants/{slug}/portfolio/communities
  2. control plane proxy allowlist  -> tenant_area_client::valid_operations_request
  3. AREA tunnel Caddyfile          -> the @operations matcher, else `respond 404`
  4. crowdrelay authority           -> is_control_plane_management_path

The tunnel had no entry, so it answered 404, which the control plane maps to
ApiError::NotFound whose Display is exactly "not found". Even with the tunnel
fixed, `/v1/admin/` demands PrivilegedAuthorization::Admin while the control
plane only ever holds the derived ControlPlane token, so the next answer would
have been 401. The endpoints now live under `/v1/control-plane/`.

This gate asserts every layer agrees, and that the dead `/v1/admin/` spelling
does not come back.
"""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CROWDRELAY = ROOT.parent / "crowdrelay"

OPERATIONS_ROUTES = ROOT / "crates/control-plane-api/src/operations_routes.rs"
AREA_CLIENT = ROOT / "crates/control-plane-api/src/tenant_area_client.rs"
TUNNEL = ROOT / "deploy/virya-area-tunnel.Caddyfile"

BASE = "/v1/control-plane/community-intelligence/communities"
LEGACY = "/v1/admin/community-intelligence/"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class ControlPlaneSide(unittest.TestCase):
    def test_proxy_targets_the_control_plane_namespace(self) -> None:
        source = read(OPERATIONS_ROUTES)
        self.assertIn(f'"{BASE}"', source)
        self.assertIn(f"{BASE}/{{place_id}}/observations", source)
        self.assertIn(f"{BASE}/{{place_id}}/entities", source)

    def test_proxy_allowlist_covers_all_three_paths(self) -> None:
        source = read(AREA_CLIENT)
        self.assertIn(f'"{BASE}"', source)
        self.assertIn(f'"{BASE}/"', source)
        self.assertIn('"/observations"', source)
        self.assertIn('"/entities"', source)

    def test_tunnel_allowlists_the_paths(self) -> None:
        source = read(TUNNEL)
        self.assertIn(f"{BASE} \\", source, "tunnel would answer 404 (respond 404 fallback)")
        self.assertIn(f"{BASE}/*", source)

    def test_tunnel_still_fails_closed(self) -> None:
        """The default-deny must survive; an allowlist without it allows all."""
        self.assertIn("respond 404", read(TUNNEL))

    def test_legacy_admin_spelling_is_gone(self) -> None:
        for path in (OPERATIONS_ROUTES, AREA_CLIENT, TUNNEL):
            self.assertNotIn(
                LEGACY,
                read(path),
                f"{path.name} still references the unreachable /v1/admin/ namespace",
            )


@unittest.skipUnless(CROWDRELAY.is_dir(), "crowdrelay checkout not present")
class CrowdRelaySide(unittest.TestCase):
    def routes(self) -> str:
        return read(CROWDRELAY / "crates/crowdrelay-api/src/community_intelligence_routes.rs")

    def test_routes_are_registered_under_control_plane(self) -> None:
        source = self.routes()
        self.assertIn(f'"{BASE}"', source)
        self.assertNotIn(LEGACY, source)

    def test_routes_are_merged_into_the_router(self) -> None:
        source = read(CROWDRELAY / "crates/crowdrelay-api/src/routing.rs")
        self.assertIn("community_intelligence_routes::control_plane_routes()", source)

    def test_authority_layer_grants_the_control_plane_token(self) -> None:
        """Without this the request is rejected 401 by enforce_privileged_namespace."""
        source = read(CROWDRELAY / "crates/crowdrelay-api/src/lib.rs")
        start = source.index("fn is_control_plane_management_path(")
        body = source[start : source.index("\nasync fn", start)]
        self.assertIn(f'"{BASE}"', body)
        self.assertIn(f'"{BASE}/"', body)
        self.assertIn('"/observations"', body)
        self.assertIn('"/entities"', body)


if __name__ == "__main__":
    unittest.main()
