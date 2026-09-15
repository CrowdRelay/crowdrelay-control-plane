#!/usr/bin/env python3
"""Destinations a tenant must understand only go down — twelve today, six the
target.

The console was shaped like the backend, and every new capability became a new
top-level place to look. The UX plan's standing rule is that no new tenant
destination ships without deleting or merging one — the gig page exists
precisely so nine capabilities get a home that is not a new tab. A rule that
lives only in the plan gets broken by the next session; this ratchet is the
rule.

Scope is `TENANT_NAV_GROUPS` in `frontend/src/lib/nav.ts` — the sidebar groups
a tenant sees. Global nav items (Overview, Tenants, Process map) are operator
destinations, not tenant ones, and are not counted.

The ratchet turns one way. Removing or merging a destination lowers the count
and the baseline must be lowered in the same commit. Raising it is a review
decision: the plan targets six, and every addition without a deletion is a
step away from it.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAV = ROOT / "frontend" / "src" / "lib" / "nav.ts"
BASELINE_PATH = ROOT / "scripts/destination_count_ratchet.json"

# The tenant groups array ends at the closing `]` before GLOBAL_NAV. Matching
# the slice keeps global items out of the count.
GROUPS = re.compile(r"TENANT_NAV_GROUPS[^=]*=\s*\[(.*?)\n\]", re.DOTALL)
# The band set is the sidebar a tenant operator actually sees — the role split
# is what the six-destination target is *for*, so it gets the harder ceiling.
BAND_GROUPS = re.compile(r"BAND_NAV_GROUPS[^=]*=\s*\[(.*?)\n\]", re.DOTALL)
ITEM = re.compile(r"\{\s*path:\s*'/tenants/\$slug")


def main() -> int:
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    ceiling = int(baseline["maxTenantDestinations"])

    match = GROUPS.search(NAV.read_text(encoding="utf-8"))
    if not match:
        print("ERROR: TENANT_NAV_GROUPS not found in nav.ts; update the gate", file=sys.stderr)
        return 1
    actual = len(ITEM.findall(match.group(1)))

    if actual > ceiling:
        print(
            f"tenant destinations grew to {actual}, baseline {ceiling}. No new "
            f"top-level destination without deleting or merging one — give the "
            f"capability a home on an existing page instead.",
            file=sys.stderr,
        )
        return 1
    if actual < ceiling:
        print(
            f"tenant destinations fell to {actual} below baseline {ceiling} — "
            f"lower destination_count_ratchet.json in the same commit",
            file=sys.stderr,
        )
        return 1

    band_ceiling = int(baseline.get("maxBandDestinations", 0))
    band_match = BAND_GROUPS.search(NAV.read_text(encoding="utf-8"))
    if band_ceiling:
        if not band_match:
            print("ERROR: BAND_NAV_GROUPS not found in nav.ts; update the gate", file=sys.stderr)
            return 1
        band = len(ITEM.findall(band_match.group(1)))
        if band > band_ceiling:
            print(
                f"band destinations grew to {band}, baseline {band_ceiling} — "
                f"the band's sidebar is the six-destination target; do not add "
                f"to it without removing one.",
                file=sys.stderr,
            )
            return 1
        if band < band_ceiling:
            print(
                f"band destinations fell to {band} below baseline {band_ceiling} — "
                f"lower destination_count_ratchet.json in the same commit",
                file=sys.stderr,
            )
            return 1
        print(f"DESTINATION_COUNT_RATCHET=PASS destinations={actual} band={band}")
        return 0
    print(f"DESTINATION_COUNT_RATCHET=PASS destinations={actual}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
