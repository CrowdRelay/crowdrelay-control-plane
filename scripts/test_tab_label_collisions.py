#!/usr/bin/env python3
"""One word per concept across all pages — tab and nav labels never collide.

Four collisions were live when this gate was written: `Overview` named both the
fleet home and the health page's default tab, `Runtime` named both autopilot
switches and read-only vitals, `Communities` named a page tab and a different
list nested inside it, and `Intelligence` named the tenant intelligence page
and an unrelated observations pane. Two things sharing one word is how an
operator learns the wrong map — they click the name they know and land on the
concept they did not.

This gate collects every user-facing label the shell can render — the nav
items in `src/lib/nav.ts` and every `{ id, label }` entry handed to a `TabBar`
in `src/pages/` — and fails on a duplicate word. Matching on the `label:` key
in a `{ id: '...', label: '...' }` tab literal keeps this to navigation text;
panel headings, section titles and select options are not navigation and are
not this rule's business.

The rule is per-word, not per-page: a label may repeat only if it names the
same concept twice, which is what the allowlist below records. Keep it empty.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend" / "src"

LABEL = re.compile(r"label:\s*'([^']+)'")

# Files whose `label:` entries are navigation vocabulary: the sidebar groups
# and every page's TabBar declaration. Page files only — components reuse
# `label:` for form fields and metrics, which are not destinations.
SOURCES = [
    FRONTEND / "lib" / "nav.ts",
    *sorted((FRONTEND / "pages").glob("*.tsx")),
]

# Labels that name the same concept twice and are allowed to repeat. Empty:
# the collisions this gate was written over were all different concepts
# sharing a word.
ALLOWED_DUPLICATES: set[str] = set()


def labels(path: Path) -> list[str]:
    return LABEL.findall(path.read_text(encoding="utf-8"))


def main() -> int:
    seen: dict[str, list[str]] = {}
    for path in SOURCES:
        if not path.exists():
            print(f"ERROR: tracked source {path} is gone; update the gate", file=sys.stderr)
            return 1
        for label in labels(path):
            seen.setdefault(label.casefold(), []).append(f"{path.relative_to(ROOT)}:{label}")

    failures = {
        word: sites
        for word, sites in seen.items()
        if len(sites) > 1 and word not in {w.casefold() for w in ALLOWED_DUPLICATES}
    }
    for word, sites in sorted(failures.items()):
        print(
            f"label collision '{word}' at {', '.join(sites)} — one word per "
            f"concept across all pages; rename the one that is not the concept",
            file=sys.stderr,
        )
    if failures:
        return 1
    print(f"TAB_LABEL_COLLISIONS=PASS labels={sum(len(v) for v in seen.values())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
