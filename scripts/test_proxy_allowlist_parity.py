#!/usr/bin/env python3
"""Proxy allowlist ↔ upstream route parity.

`tenant_area_client::valid_operations_request` is a hand-edited list. Three
times now a route went live upstream while the allowlist stayed silent, and
the console section behind it degraded permanently — `ops/action-states` sat
unreachable while `read_models::brain` joined on it, marking the section
failed and re-running a 7-call fan-out on every mount.

CrowdRelay's own side of the boundary learned this lesson and replaced its
list with a path-prefix rule; the console still keeps the list, so the parity
has to be gated instead.

Two directions, both checked against literals, not hand-maintained tables:

  A. every static `/v1/control-plane/…` path the control plane *calls*
     (read_models.rs, operations_routes.rs, area_routes.rs,
     attention_routes.rs, automation_routes.rs, routes.rs) must be present in
     `tenant_area_client.rs` — as a full allowlist arm or as the static
     prefix a segment validator accepts.

  B. every allowlisted static path must appear among the route literals in
     `crowdrelay-api/src/` — an entry that upstream never registers is a dead
     arm that only ever answers 404.

Dynamic segments (`{action_id}` and friends) are normalized to `{}` before
comparison; query strings are stripped. The upstream set is every
`/v1/control-plane/…` literal in the API crate, so a path named only in a
doc comment can satisfy B — rare, and the allowlist arm is still useless
without direction A being clean.

Skips direction B entirely when the sibling checkout is absent.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "crates/control-plane-api/src"
CROWDRELAY_API = ROOT.parent / "crowdrelay" / "crates/crowdrelay-api/src"

PROXY_CALLER_FILES = [
    "read_models.rs",
    "operations_routes.rs",
    "area_routes.rs",
    "attention_routes.rs",
    "automation_routes.rs",
    "routes.rs",
]
CLIENT = API / "tenant_area_client.rs"
PATH_RE = re.compile(r'"(/v1/control-plane/[^"]*)"')


def norm_path(literal: str) -> str:
    """Strip query strings and normalize dynamic segments to `{}`."""
    path = literal.split("?", 1)[0]
    return re.sub(r"\{[^}]*\}", "{}", path)


def literals_in(path: Path) -> set[str]:
    return set(PATH_RE.findall(path.read_text(encoding="utf-8")))


def allowlist_arms() -> set[str]:
    """Literals inside `valid_operations_request` only — the file also holds
    segment-validator prefixes and negative-test paths which are not arms."""
    source = CLIENT.read_text(encoding="utf-8")
    start = source.index("fn valid_operations_request")
    end = source.index("\nfn ", start + 1)
    return set(PATH_RE.findall(source[start:end]))


def upstream_routes() -> set[str] | None:
    if not CROWDRELAY_API.exists():
        return None
    out: set[str] = set()
    for rs in CROWDRELAY_API.rglob("*.rs"):
        out |= {norm_path(p) for p in literals_in(rs)}
    return out


class CalledPathsAreAllowlisted(unittest.TestCase):
    def test_every_called_static_path_is_allowlisted(self) -> None:
        client = CLIENT.read_text(encoding="utf-8")
        missing: list[str] = []
        for name in PROXY_CALLER_FILES:
            for literal in sorted(literals_in(API / name)):
                static = norm_path(literal)
                # /v1/control-plane/area/** rides `request()`'s own prefix
                # boundary, not valid_operations_request.
                if static.startswith("/v1/control-plane/area"):
                    continue
                if "{}" not in static:
                    # Fully static path — must appear verbatim as an arm.
                    if f'"{static}"' not in client:
                        missing.append(f"{name}: {static}")
                else:
                    # Dynamic: the static prefix before the first {} must be
                    # present in the client (prefix arm or segment validator).
                    prefix = static.split("{}", 1)[0]
                    if prefix not in client:
                        missing.append(f"{name}: {literal} (prefix {prefix!r})")
        self.assertEqual(
            [],
            missing,
            "control-plane calls these upstream paths but "
            "valid_operations_request has no arm for them",
        )


class AllowlistedPathsExistUpstream(unittest.TestCase):
    def test_every_allowlist_arm_is_registered_upstream(self) -> None:
        upstream = upstream_routes()
        if upstream is None:
            self.skipTest("sibling crowdrelay checkout not present")
        dead: list[str] = []
        for literal in sorted(allowlist_arms()):
            # Trailing-slash literals are segment-validator prefixes for the
            # dynamic routes beneath them, not full paths of their own.
            if literal.endswith("/"):
                continue
            if norm_path(literal) not in upstream:
                dead.append(literal)
        self.assertEqual(
            [],
            dead,
            "tenant_area_client allowlists paths that crowdrelay-api "
            "never registers",
        )


if __name__ == "__main__":
    unittest.main()
