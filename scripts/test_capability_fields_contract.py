#!/usr/bin/env python3
"""Every form field the console sends is a field CrowdRelay reads.

The capability forms in `frontend/src/lib/capabilities.ts` post JSON bodies
through the surface proxy to canonical CrowdRelay handlers, most of which
deserialize with `deny_unknown_fields`. A field named in the wrong case — the
audience-graph and portfolio requests are `camelCase`, the rest snake_case —
compiles, builds, renders, and is refused with a bare 400 at the click. Four
forms shipped that way before this check existed.

For each write in the registry this finds the upstream route, its handler, the
`Json<T>` it extracts and `T`'s fields (with `rename_all = "camelCase"`
applied), and fails on any form field the struct does not have. Skips when no
crowdrelay checkout sits beside this one (set CROWDRELAY_ROOT to point at one).
"""

from __future__ import annotations

import os
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAPABILITIES = ROOT / "frontend/src/lib/capabilities.ts"
CROWDRELAY = Path(os.environ.get("CROWDRELAY_ROOT", ROOT.parent / "crowdrelay"))
API = CROWDRELAY / "crates/crowdrelay-api/src"
ROUTERS = ["control_plane.rs", "control_plane_operator.rs"]


def rust_sources() -> dict[Path, str]:
    return {path: path.read_text(encoding="utf-8") for path in API.rglob("*.rs")}


def routes(sources: dict[Path, str]) -> dict[tuple[str, str], str]:
    found: dict[tuple[str, str], str] = {}
    for name in ROUTERS:
        text = re.sub(r"//[^\n]*", "", sources[API / name])
        for part in text.split(".route(")[1:]:
            match = re.match(r'\s*"/v1/control-plane/([^"]+)"\s*,(.*)', part, re.S)
            if not match:
                continue
            expression = match.group(2).split(".route_layer")[0]
            for verb in re.finditer(r"\b(get|post|put|delete)\(\s*([\w:]+)", expression):
                found[(verb.group(1).upper(), match.group(1))] = verb.group(2)
    return found


def handler(sources: dict[Path, str], qualified: str) -> tuple[str, str] | None:
    parts = qualified.replace("crate::", "").split("::")
    function, module = parts[-1], "/".join(parts[:-1])
    ordered = sorted(
        sources,
        key=lambda p: not (module and (p.as_posix().endswith(f"/{module}.rs") or f"/{module}/" in p.as_posix())),
    )
    for path in ordered:
        match = re.search(
            r"pub(?:\([^)]*\))?\s+async\s+fn\s+" + function + r"\s*(?:<[^>]*>)?\((.*?)\)\s*->",
            sources[path],
            re.S,
        )
        if match:
            return match.group(1), sources[path]
    return None


def struct_fields(sources: dict[Path, str], home: str, name: str) -> list[str] | None:
    pattern = r"((?:#\[[^\]]*\]\s*)*)(?:pub(?:\([^)]*\))?\s+)?struct\s+" + name + r"\b[^{;]*\{(.*?)\n\}"
    match = re.search(pattern, home, re.S)
    if not match:
        for text in sources.values():
            match = re.search(pattern, text, re.S)
            if match:
                break
    if not match:
        return None
    fields = re.findall(r"\n\s*(?:#\[[^\n]*\]\s*)*(?:pub(?:\([^)]*\))?\s+)?(\w+)\s*:", match.group(2))
    if "camelCase" in match.group(1):
        fields = [re.sub(r"_([a-z])", lambda m: m.group(1).upper(), f) for f in fields]
    return fields


def form_writes() -> list[tuple[str, str, list[str]]]:
    source = CAPABILITIES.read_text(encoding="utf-8")
    body = source.split("export const SURFACE_CAPABILITIES", 1)[1].split("export const PAGE_CAPABILITIES", 1)[0]
    writes = []
    for match in re.finditer(r"method:\s*'(POST|PUT|DELETE)',\s*path:\s*'([^']+)'", body):
        tail = body[match.end():]
        end = re.search(r"\n\s*\{\s*label:|\n\s*\],\n|\n  \},", tail)
        chunk = tail[: end.start() if end else 400]
        writes.append((match.group(1), match.group(2), re.findall(r"name: '(\w+)'", chunk)))
    return writes


@unittest.skipUnless(API.is_dir(), "no crowdrelay checkout beside this one (set CROWDRELAY_ROOT)")
class CapabilityFieldsContract(unittest.TestCase):
    def test_every_form_field_is_read_upstream(self) -> None:
        sources = rust_sources()
        table = routes(sources)
        writes = form_writes()
        self.assertGreater(len(writes), 40, "form parse collapsed")
        problems: list[str] = []
        checked = 0
        for method, path, fields in writes:
            qualified = table.get((method, path))
            if qualified is None:
                problems.append(f"{method} {path}: no upstream route")
                continue
            found = handler(sources, qualified)
            if found is None:
                problems.append(f"{method} {path}: handler {qualified} not found")
                continue
            params, home = found
            body_type = re.findall(r"Json<\s*([\w:]+)\s*>", params)
            if not body_type:
                continue  # Raw bytes or no body — nothing to compare by name.
            struct = struct_fields(sources, home, body_type[0].split("::")[-1])
            if struct is None:
                problems.append(f"{method} {path}: request struct {body_type[0]} not found")
                continue
            checked += 1
            unknown = [field for field in fields if field not in struct]
            if unknown:
                problems.append(f"{method} {path}: {unknown} not in {struct}")
        self.assertGreater(checked, 30, "struct resolution collapsed")
        self.assertEqual(problems, [], "\n  " + "\n  ".join(problems))


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=0).result
    print("CAPABILITY_FIELDS_CONTRACT=" + ("PASS" if result.wasSuccessful() else "FAIL"))
    sys.exit(0 if result.wasSuccessful() else 1)
