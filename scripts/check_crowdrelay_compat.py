#!/usr/bin/env python3
"""Check Control Plane management calls against current CrowdRelay source.

Usage: check_crowdrelay_compat.py <crowdrelay-checkout>
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit("usage: check_crowdrelay_compat.py <crowdrelay-checkout>")
CROWDRELAY = Path(sys.argv[1]).resolve()
if not (CROWDRELAY / "crates/crowdrelay-api/src").is_dir():
    raise SystemExit(f"invalid CrowdRelay checkout: {CROWDRELAY}")

AREA = (ROOT / "crates/control-plane-api/src/area_routes.rs").read_text(encoding="utf-8")
CONTROL_FILES = [
    ROOT / "crates/control-plane-api/src/area_routes.rs",
    ROOT / "crates/control-plane-api/src/operations_routes.rs",
    ROOT / "crates/control-plane-api/src/attention_routes.rs",
]
control_text = "\n".join(path.read_text(encoding="utf-8") for path in CONTROL_FILES)
upstream_text = "\n".join(
    path.read_text(encoding="utf-8")
    for path in (CROWDRELAY / "crates/crowdrelay-api/src").rglob("*.rs")
)

def route_literals(text: str) -> set[str]:
    return {
        path
        for path in re.findall(r'"(/v1/control-plane/[^"?]+)(?:\?[^\"]*)?"', text)
        if "{suffix}" not in path
    }

def normalized(path: str) -> str:
    return re.sub(r"\{[^}/]+\}", "{}", path.rstrip("/"))

control_routes = {normalized(path) for path in route_literals(control_text)}
# AREA dynamic calls share one validated helper; derive the concrete route
# families from every suffix used at its call sites instead of treating the
# helper's `{suffix}` implementation string as an upstream endpoint.
for suffix in re.findall(r'drop_path\([^,]+,\s*"([^"]*)"\)', AREA):
    control_routes.add(normalized(f"/v1/control-plane/area/drops/{{drop_id}}{suffix}"))

upstream_routes = {normalized(path) for path in route_literals(upstream_text)}
missing_source = sorted(path for path in control_routes if path not in upstream_routes)
if missing_source:
    raise SystemExit(
        "Control Plane calls routes missing from CrowdRelay source: " + ", ".join(missing_source)
    )

def caddy_patterns(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    return set(re.findall(r"/v1/control-plane/[^\\\s]+", text))

def covered(route: str, patterns: set[str]) -> bool:
    concrete = route.split("{}", 1)[0].rstrip("/")
    for pattern in patterns:
        candidate = pattern.rstrip("/")
        if candidate.endswith("/*"):
            prefix = candidate[:-2]
            if concrete == prefix or concrete.startswith(prefix + "/"):
                return True
        if normalized(candidate) == route:
            return True
    return False

home_patterns = caddy_patterns(ROOT / "deploy/virya-area-tunnel.Caddyfile")
oracle_patterns = caddy_patterns(CROWDRELAY / "deploy/area-management.Caddyfile")
for name, patterns in (("home tunnel", home_patterns), ("Oracle proxy", oracle_patterns)):
    missing = sorted(route for route in control_routes if not covered(route, patterns))
    if missing:
        raise SystemExit(f"{name} is missing Control Plane route coverage: {', '.join(missing)}")

for caddy in (
    ROOT / "deploy/virya-area-tunnel.Caddyfile",
    CROWDRELAY / "deploy/area-management.Caddyfile",
):
    text = caddy.read_text(encoding="utf-8")
    if "/healthz/ready" not in text:
        raise SystemExit(f"management readiness route missing from {caddy}")

print(
    "CROSS_REPO_MANAGEMENT_COMPAT=PASS "
    f"routes={len(control_routes)} source=present home=covered oracle=covered readiness=e2e"
)
