#!/usr/bin/env python3
"""Design-token ratchet — today's numbers are the ceiling, each sprint lowers them.

§7b of the control-plane UX plan counted the drift: radius scales multiplied,
shadows appeared on surfaces the design rule says separate by borders,
arbitrary pixel values escaped the skeleton, hex literals bypassed the token
file, and raw form elements grew outside `components/ui/` — where a bare
`<button>` silently escapes `writeGuard()` and the variant system.

A rule that lives only in the plan gets broken by the next session; this
ratchet is the rule. It turns one way: a lower count is a win and the
baseline must be lowered in the same commit. A higher count fails.

Counts and what stays out of them:

- `radius_variants` — distinct `rounded*` utility classes. Directional
  variants (rounded-t, rounded-bl) count: each is a scale someone chose.
- `shadows_outside_overlays` — `shadow-*` classes outside the overlay
  primitives (dialogs, popovers, toasts) where floating is the metaphor.
- `arbitrary_px_outside_skeleton` — `[Npx]` values outside skeleton files;
  skeletons measure themselves, everything else uses the scale.
- `hex_outside_exempt` — hex literals outside `components/ui/`, `styles/`,
  `ProviderIcon.tsx` (brand colors are data, not tokens) and
  `GrowthMetricsPanel.tsx` (the chart file).
- `raw_form_elements` — `<button>`/`<input>`/`<select>`/`<textarea>` outside
  `components/ui/`, which is where the primitive wrappers live.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "frontend" / "src"
BASELINE_PATH = ROOT / "scripts" / "design_tokens_baseline.json"

RADIUS = re.compile(r"\brounded(?:-[a-z0-9]+|-\[[0-9]+px\])?")
SHADOW = re.compile(r"\bshadow-(?:sm|md|lg|xl|2xl|\[)")
ARBITRARY_PX = re.compile(r"\[[0-9]+px\]")
HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RAW_ELEMENT = re.compile(r"<(?:button|input|select|textarea)\b")

# Surfaces allowed to float (shadows) and files whose hex is data, not tokens.
OVERLAY_PRIMITIVES = {
    "dialog.tsx", "alert-dialog.tsx", "popover.tsx", "toast.tsx",
    "tooltip.tsx", "dropdown-menu.tsx", "select.tsx", "sheet.tsx",
    "hover-card.tsx",
}
HEX_EXEMPT_FILES = {
    "components/ProviderIcon.tsx",      # brand colors are data
    "components/GrowthMetricsPanel.tsx",  # the chart file
}
SKELETON_RE = re.compile(r"skeleton", re.IGNORECASE)
# The dev-only style guide renders every shadow, radius and colour as a
# specimen, and a production build does not include it.
SPECIMEN_DIR = "pages/styleguide/"


COMMENT = re.compile(r"//[^\n]*|/\*.*?\*/", re.DOTALL)


def strip_comments(text: str) -> str:
    # `{/* */}` JSX comments and `//` lines can name elements (`<button>`
    # appears in two of them today); counting markup means scanning markup.
    return COMMENT.sub(" ", text)


def tsx_files() -> list[Path]:
    return sorted(p for p in SRC.rglob("*.tsx") if p.is_file())


def in_ui(path: Path) -> bool:
    return path.parent.name == "ui" and path.parent.parent.name == "components"


def measure() -> dict[str, int]:
    radius: set[str] = set()
    shadows = 0
    arbitrary_px = 0
    hex_count = 0
    raw_elements = 0

    for path in tsx_files():
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(SRC).as_posix()
        if rel.startswith(SPECIMEN_DIR):
            continue

        radius.update(RADIUS.findall(text))
        if not (in_ui(path) and path.name in OVERLAY_PRIMITIVES):
            shadows += len(SHADOW.findall(text))
        if not SKELETON_RE.search(path.name):
            arbitrary_px += len(ARBITRARY_PX.findall(text))
        if not in_ui(path) and rel not in HEX_EXEMPT_FILES:
            hex_count += len(HEX.findall(text))
        if not in_ui(path):
            raw_elements += len(RAW_ELEMENT.findall(strip_comments(text)))

    # lib/*.ts carries hex too (qrCode.ts today).
    for path in sorted(SRC.rglob("*.ts")):
        if path.name.endswith(".d.ts"):
            continue
        rel = path.relative_to(SRC).as_posix()
        if rel in HEX_EXEMPT_FILES:
            continue
        hex_count += len(HEX.findall(path.read_text(encoding="utf-8")))

    return {
        "radius_variants": len(radius),
        "shadows_outside_overlays": shadows,
        "arbitrary_px_outside_skeleton": arbitrary_px,
        "hex_outside_exempt": hex_count,
        "raw_form_elements": raw_elements,
    }


def main() -> int:
    actual = measure()

    if "--write-baseline" in sys.argv:
        BASELINE_PATH.write_text(
            json.dumps(actual, indent=2) + "\n", encoding="utf-8"
        )
        print(f"baseline rewritten: {actual}")
        return 0

    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))

    failed = False
    for key, ceiling in baseline.items():
        now = actual[key]
        if now > ceiling:
            failed = True
            print(
                f"FAIL {key}: {now} > ceiling {ceiling} — the design-token "
                "ratchet only shrinks; find the new escape and use the token",
                file=sys.stderr,
            )
        elif now < ceiling:
            failed = True
            print(
                f"FAIL {key}: {now} < ceiling {ceiling} — a lower count is a "
                "win; lower the baseline in the same commit "
                "(`python3 scripts/test_design_tokens.py --write-baseline`)",
                file=sys.stderr,
            )
        else:
            print(f"OK   {key}: {now} (ceiling {ceiling})")

    if failed:
        return 1
    print("DESIGN_TOKENS=PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
