#!/usr/bin/env python3
"""Every proxied operator capability is visible in the console, and nothing
in the console names a route the proxy does not serve.

`crates/control-plane-api/src/surface_routes.rs` proxies a table of CrowdRelay
routes. `frontend/src/lib/capabilities.ts` is where a person finds them. The
recurring defect across this system is a capability that works and nobody can
reach: 78 admin routes had no path through the console, and eleven live routes
were refused by the proxy allowlist until someone pressed the button. A route
added to the table and not to the map would be the same defect one layer up.

Both directions, keyed by `METHOD path`:
  - a SURFACE entry with no capability read or action is invisible;
  - a capability naming a path the table lacks 404s at the button.

And placement, because a capability listed in a registry is still unreachable
if no screen renders it. Every capability names a `home` — the page and section
where the moment already is — or a `gap` saying why no screen can host it yet.
A capability with a home must be referenced by a component or page other than
the capabilities index (`capability('id')` / `capabilityAction('id', …)`), or
the home is a claim nothing implements.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SURFACE = ROOT / "crates/control-plane-api/src/surface_routes.rs"
CAPABILITIES = ROOT / "frontend/src/lib/capabilities.ts"


def surface_entries() -> set[str]:
    source = SURFACE.read_text(encoding="utf-8")
    table = source.split("pub(crate) const SURFACE", 1)[1].split("];", 1)[0]
    entries = set()
    for match in re.finditer(r'\bread(?:_q)?\(\s*"([^"]+)"', table):
        entries.add(f"GET {match.group(1)}")
    for match in re.finditer(r'\bwrite\(\s*"(POST|PUT|DELETE)",\s*"([^"]+)"', table, re.S):
        entries.add(f"{match.group(1)} {match.group(2)}")
    return entries


def capability_entries() -> set[str]:
    source = CAPABILITIES.read_text(encoding="utf-8")
    body = source.split("export const SURFACE_CAPABILITIES", 1)[1].split(
        "export const PAGE_CAPABILITIES", 1
    )[0]
    entries = set()
    for match in re.finditer(r"read:\s*\{\s*path:\s*'([^']+)'", body):
        entries.add(f"GET {match.group(1)}")
    for match in re.finditer(r"method:\s*'(POST|PUT|DELETE)',\s*path:\s*'([^']+)'", body):
        entries.add(f"{match.group(1)} {match.group(2)}")
    return entries


FRONTEND = ROOT / "frontend/src"
INDEX_PAGE = FRONTEND / "pages/TenantCapabilitiesPage.tsx"


def capability_blocks() -> dict[str, str]:
    """Each SURFACE_CAPABILITIES entry's source text, keyed by id."""
    source = CAPABILITIES.read_text(encoding="utf-8")
    body = source.split("export const SURFACE_CAPABILITIES", 1)[1].split(
        "export const PAGE_CAPABILITIES", 1
    )[0]
    starts = [(m.start(), m.group(1)) for m in re.finditer(r"\bid: '([^']+)'", body)]
    blocks = {}
    for index, (start, cid) in enumerate(starts):
        end = starts[index + 1][0] if index + 1 < len(starts) else len(body)
        blocks[cid] = body[start:end]
    return blocks


def wired_ids() -> set[str]:
    ids = set()
    for path in FRONTEND.rglob("*.tsx"):
        if path == INDEX_PAGE:
            continue
        for match in re.finditer(r"capability(?:Action)?\(\s*'([^']+)'", path.read_text(encoding="utf-8")):
            ids.add(match.group(1))
    return ids


class CapabilityMap(unittest.TestCase):
    def setUp(self) -> None:
        self.surface = surface_entries()
        self.capabilities = capability_entries()

    def test_the_parsers_see_both_files(self) -> None:
        # A pattern that matches nothing would pass both checks vacuously.
        self.assertGreater(len(self.surface), 80, "SURFACE parse collapsed")
        self.assertGreater(len(self.capabilities), 80, "capability parse collapsed")
        self.assertIn("GET ops/action-states", self.surface)
        self.assertIn("DELETE autopilot/booking-targets/{target_id}/venues/{venue_id}", self.surface)

    def test_every_proxied_route_has_a_capability(self) -> None:
        missing = sorted(self.surface - self.capabilities)
        self.assertEqual(
            missing,
            [],
            "proxied but invisible — add a read or action in capabilities.ts:\n  "
            + "\n  ".join(missing),
        )

    def test_every_capability_has_a_home_or_a_stated_gap(self) -> None:
        unplaced = sorted(
            cid
            for cid, block in capability_blocks().items()
            if ("home: {" in block) == ("gap: '" in block)
        )
        self.assertEqual(unplaced, [], f"need exactly one of home or gap: {unplaced}")

    def test_every_homed_capability_is_rendered_somewhere(self) -> None:
        wired = wired_ids()
        unwired = sorted(
            cid
            for cid, block in capability_blocks().items()
            if "home: {" in block and cid not in wired
        )
        self.assertEqual(
            unwired,
            [],
            "these claim a home no component renders — build the placement or "
            "state the gap:\n  " + "\n  ".join(unwired),
        )

    def test_every_capability_names_a_proxied_route(self) -> None:
        unserved = sorted(self.capabilities - self.surface)
        self.assertEqual(
            unserved,
            [],
            "the console names routes the proxy does not serve:\n  " + "\n  ".join(unserved),
        )


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=0).result
    if result.wasSuccessful():
        print(f"CAPABILITY_MAP=PASS routes={len(surface_entries())}")
    else:
        print("CAPABILITY_MAP=FAIL")
        sys.exit(1)
