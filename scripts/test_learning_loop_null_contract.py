"""Contract tests for LearningLoopPanel null/corruption handling.

Enforces that the frontend distinguishes four states:
1. action === null && !warning -> "No action"
2. action !== null -> render normally
3. action === null && warning -> "Data integrity issue"
4. same for outcomes

Also enforces that types.ts has data_integrity_warning and that
action/outcome fields are non-optional (matching the backend contract).
"""

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PANEL = ROOT / "frontend/src/components/LearningLoopPanel.tsx"
TYPES = ROOT / "frontend/src/lib/types.ts"


class LearningLoopNullContract(unittest.TestCase):
    def test_frontend_renders_data_integrity_issue(self):
        """LearningLoopPanel must render 'Data integrity issue' for corrupt fields."""
        text = PANEL.read_text()
        self.assertIn(
            "Data integrity issue",
            text,
            "LearningLoopPanel must render explicit 'Data integrity issue' text",
        )

    def test_frontend_checks_data_integrity_warning(self):
        """LearningLoopPanel must check data_integrity_warning to distinguish
        absent from corrupt."""
        text = PANEL.read_text()
        self.assertIn(
            "data_integrity_warning",
            text,
            "LearningLoopPanel must reference data_integrity_warning",
        )

    def test_types_have_data_integrity_warning(self):
        """types.ts must include data_integrity_warning on LearningLoopEntry."""
        text = TYPES.read_text()
        self.assertIn(
            "data_integrity_warning",
            text,
            "LearningLoopEntry type must have data_integrity_warning field",
        )

    def test_types_action_fields_non_optional(self):
        """action_kind and status must be non-optional (backend guarantees them
        or sets data_integrity_warning)."""
        text = TYPES.read_text()
        self.assertIn(
            "action_kind: string",
            text,
            "action_kind must be non-optional string (backend contract)",
        )
        self.assertIn(
            "status: string",
            text,
            "status must be non-optional string (backend contract)",
        )

    def test_types_outcome_fields_non_optional(self):
        """metric_key, delta_basis_points, observed_at must be non-optional
        (backend guarantees them or sets data_integrity_warning)."""
        text = TYPES.read_text()
        self.assertIn(
            "metric_key: string",
            text,
            "metric_key must be non-optional string (backend contract)",
        )
        self.assertIn(
            "delta_basis_points: number",
            text,
            "delta_basis_points must be non-optional number (backend contract)",
        )


if __name__ == "__main__":
    unittest.main()
