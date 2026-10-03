#!/usr/bin/env python3
"""Style-guide coverage — every primitive has a page at localhost/styleguide.

The style guide (frontend/src/pages/styleguide/) documents components with
`DocEntry` records; each lists the files it covers in `sources: [...]`.
This check fails when a file in one of the primitive folders is not listed
by any entry — so a new `components/ui/progress.tsx` cannot land without a
page, and a deleted file cannot leave a page pointing at nothing.

Feature panels (components/*.tsx) are compositions of documented parts and
are not required; the guide's Inventory tab still lists them.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "frontend" / "src"
GUIDE = SRC / "pages" / "styleguide"
REQUIRED_DIRS = ["components/ui", "components/app", "components/shell"]

SOURCES = re.compile(r"sources:\s*\[([^\]]*)\]")
STRING = re.compile(r"'([^']+)'|\"([^\"]+)\"")


def documented() -> set[str]:
    out: set[str] = set()
    for path in GUIDE.glob("*.tsx"):
        for block in SOURCES.findall(path.read_text(encoding="utf-8")):
            for a, b in STRING.findall(block):
                out.add(a or b)
    return out


def required() -> set[str]:
    out: set[str] = set()
    for d in REQUIRED_DIRS:
        for p in (SRC / d).glob("*.tsx"):
            out.add(p.relative_to(SRC).as_posix())
    return out


def main() -> int:
    docs = documented()
    need = required()
    missing = sorted(need - docs)
    # `<name>` placeholders come from the how-to example on the Overview tab.
    stale = sorted(s for s in docs if "<" not in s and not (SRC / s).exists())

    for m in missing:
        print(f"FAIL undocumented: src/{m} — add it to an entry's `sources` in pages/styleguide/", file=sys.stderr)
    for s in stale:
        print(f"FAIL stale source: src/{s} is listed in the style guide but does not exist", file=sys.stderr)

    covered = len(need) - len(missing)
    print(f"{'OK  ' if not missing else 'FAIL'} primitives documented: {covered}/{len(need)}")
    if missing or stale:
        print("STYLEGUIDE_COVERAGE=FAIL")
        return 1
    print("STYLEGUIDE_COVERAGE=PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
