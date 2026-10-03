#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OVERVIEW = (ROOT / "frontend/src/pages/OverviewPage.tsx").read_text(encoding="utf-8")
FLEET = (ROOT / "frontend/src/components/FleetList.tsx").read_text(encoding="utf-8")

# The platform home is one command-center flow. Do not reintroduce mutually
# exclusive dashboard tabs for information a person should scan in sequence.
assert "WorkAreas" not in OVERVIEW
assert "WorkAreaPanel" not in OVERVIEW
assert "useWorkAreas" not in OVERVIEW
assert "TenantsTable" not in OVERVIEW

# The three questions must stay visible in the first scroll.
assert "<NeedsYouCard" in OVERVIEW
assert "<NorthStarStrip" in OVERVIEW
assert "<FleetList" in OVERVIEW

# Keep the hot path bounded even when the platform carries many tenants.
assert "limit={8}" in OVERVIEW
assert "showAllLink" in OVERVIEW
assert "sorted().slice(0, props.limit ?? 50)" in FLEET
assert 'to="/tenants">View all tenants' in FLEET

print("OVERVIEW_SURFACE_CONTRACT=PASS tabs=false tenant_limit=8")
