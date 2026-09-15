#!/usr/bin/env python3
"""A missing number in a read model must stay `null`, never `0`.

This is the rule CLAUDE.md states most often and the only one of its kind with
nothing enforcing it:

    Every tenant-scoped read model asks the tenant for each section and reports
    the ones it could not get, rather than guessing: `degraded: [...]` names
    them, and a missing number is `null`, never `0`.

`unwrap_or(0)` is how that rule gets broken, and the break is silent by
construction. The cross-tenant rollup in `read_models.rs` counts
`unavailable_tenants` and then, two lines later, does

    needs_you += t["attention"]["needsYou"].as_u64().unwrap_or(0);

so an unreachable tenant contributes zero and the total reads as complete. A
wrong number that looks right survives review; a `null` does not.

This gate does not decide which of the existing sites are wrong. Several are
certainly fine, and telling them apart needs a human reading each fan-out. What
it does is stop the count growing, which is the part that does not need
judgement: a new `unwrap_or(0)` on the read-model path is a new place where an
absent answer becomes a confident zero.

Scope is the two files the rule is about. `unwrap_or(0)` elsewhere — parsing a
config value, defaulting a counter the caller owns — is ordinary and not this
rule's business.

# Why there is no allowance

`source-size-ratchet.py` in the crowdrelay repo carries an `allowanceLines`
overhead because line counts drift by a few during ordinary maintenance, and a
baseline edited by reflex stops being a review signal. This count does not
drift. Every occurrence is a deliberate decision to substitute a value, so the
allowance is zero and any change — up or down — is meant to be noticed.

The ratchet turns one way. If the count falls, the baseline must be lowered in
the same commit, or the next regression is measured against a ceiling nobody
still needs.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = ROOT / "scripts/read_model_null_ratchet.json"

# `.unwrap_or(0)`, `.unwrap_or(0.0)` and `.unwrap_or_default()` on a numeric
# read. `unwrap_or_default()` is included because its default for an integer is
# the same zero, spelled so that it does not look like one.
SUBSTITUTION = re.compile(r"\.unwrap_or\(\s*0(?:\.0)?\s*\)|\.unwrap_or_default\(\)")


def count(path: Path) -> int:
    return len(SUBSTITUTION.findall(path.read_text(encoding="utf-8")))


def main() -> int:
    baseline = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    tracked = {str(k): int(v) for k, v in baseline["maxZeroSubstitutions"].items()}

    failures: list[str] = []
    for rel, ceiling in sorted(tracked.items()):
        path = ROOT / rel
        if not path.exists():
            failures.append(f"{rel}: tracked file is gone; remove it from the baseline")
            continue
        actual = count(path)
        if actual > ceiling:
            failures.append(
                f"{rel}: {actual} zero substitutions, baseline {ceiling}. "
                f"A missing number is null, never 0 — return Option and let the "
                f"section report itself degraded."
            )
        elif actual < ceiling:
            failures.append(
                f"{rel}: {actual} zero substitutions, baseline {ceiling}. "
                f"Lower the baseline to {actual} in this commit."
            )

    if failures:
        print("READ_MODEL_NULL_RATCHET=FAIL", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1

    total = sum(count(ROOT / rel) for rel in tracked)
    print(f"READ_MODEL_NULL_RATCHET=PASS files={len(tracked)} substitutions={total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
