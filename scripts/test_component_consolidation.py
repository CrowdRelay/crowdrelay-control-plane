#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH = (ROOT / "frontend/src/components/ui/dash.tsx").read_text(encoding="utf-8")
SCORECARD = (ROOT / "frontend/src/components/ScorecardPanel.tsx").read_text(encoding="utf-8")
DATA_GUIDE = (ROOT / "frontend/src/pages/styleguide/components-data.tsx").read_text(encoding="utf-8")

assert "min-w-0 rounded-lg border bg-card" in DASH
assert "min-w-0 rounded-xl border bg-card" not in DASH
assert "ProgressRing" not in SCORECARD
assert "from './charts'" in SCORECARD
assert "<Ring" in SCORECARD
assert "components/ProgressRing" not in DATA_GUIDE
assert "ProgressRing" not in DATA_GUIDE
assert not (ROOT / "frontend/src/components/ProgressRing.tsx").exists()
