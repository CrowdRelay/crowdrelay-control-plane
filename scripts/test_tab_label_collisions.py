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

# The sidebar has two vocabularies after the role split: platform sessions
# read TENANT_NAV_GROUPS, tenant sessions read BAND_NAV_GROUPS. A word shared
# across the two sets for the same destination is the same concept — no
# session ever sees both sidebars — so collisions count only inside one
# vocabulary (nav set + page tabs).
# `const ` anchors on the declarations — the same identifiers also appear in
# the selector expression `? TENANT_NAV_GROUPS : BAND_NAV_GROUPS`, and a bare
# match there swallows every label until the next `= [` (a false third set).
NAV_SET = re.compile(r"const\s+(TENANT_NAV_GROUPS|BAND_NAV_GROUPS)[^=]*=\s*\[(.*?)\n\]", re.DOTALL)

# Files whose `label:` entries are navigation vocabulary: the sidebar groups
# and every page's TabBar declaration. Page files only — components reuse
# `label:` for form fields and metrics, which are not destinations.
NAV_FILE = FRONTEND / "lib" / "nav.ts"
PAGE_SOURCES = sorted((FRONTEND / "pages").glob("*.tsx"))

# Labels that name the same concept twice and are allowed to repeat:
# - shows: the band nav item for /tenants/$slug/shows and the breadcrumb page
#   label for that same destination — one concept, two label sites.
ALLOWED_DUPLICATES: set[str] = {"shows"}


def labels(text: str) -> list[str]:
    return LABEL.findall(text)


def main() -> int:
    page_labels: list[tuple[str, str]] = []
    for path in PAGE_SOURCES:
        if not path.exists():
            print(f"ERROR: tracked source {path} is gone; update the gate", file=sys.stderr)
            return 1
        page_labels.extend((l, str(path.relative_to(ROOT))) for l in labels(path.read_text(encoding="utf-8")))

    nav_text = NAV_FILE.read_text(encoding="utf-8")
    nav_sets = list(NAV_SET.finditer(nav_text))
    if len(nav_sets) < 2:
        print("ERROR: expected TENANT_NAV_GROUPS and BAND_NAV_GROUPS in nav.ts; update the gate", file=sys.stderr)
        return 1

    # The rest of nav.ts — breadcrumb page labels, global nav — is vocabulary
    # both roles share, so it joins each set's scan.
    shared_text = NAV_SET.sub("", nav_text)
    shared_labels = [(l, "lib/nav.ts") for l in labels(shared_text)]

    failures: dict[str, list[str]] = {}
    for m in nav_sets:
        set_name, body = m.group(1), m.group(2)
        seen: dict[str, list[str]] = {}
        for label, site in page_labels + shared_labels:
            seen.setdefault(label.casefold(), []).append(f"{site}:{label}")
        for label in labels(body):
            seen.setdefault(label.casefold(), []).append(f"lib/nav.ts:{set_name}:{label}")
        for word, sites in seen.items():
            if len(sites) > 1 and word not in {w.casefold() for w in ALLOWED_DUPLICATES}:
                failures.setdefault(word, []).extend(f"[{set_name}] {s}" for s in sites)

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
