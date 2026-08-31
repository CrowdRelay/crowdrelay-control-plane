"""Contract tests for LearningLoopPanel null/corruption handling.

Enforces that the frontend distinguishes four states using STAGE-SPECIFIC
warnings (action and outcome are independent):
1. action === null && !data_integrity.action -> "No action"
2. action !== null -> render normally
3. action === null && data_integrity.action -> "Data integrity issue"
4. same for outcomes with data_integrity.outcome

Also enforces:
- types.ts has data_integrity (not data_integrity_warning)
- action/outcome fields are non-optional (matching the backend contract)
- "Actions executed" is NOT used (replaced with "Actions created" + "Executed")
- "Success rate" is NOT used (replaced with "Positive outcome rate")
- Executed metric uses action.status === 'succeeded'
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

    def test_frontend_checks_stage_specific_warnings(self):
        """LearningLoopPanel must check data_integrity?.action and
        data_integrity?.outcome separately, NOT a shared data_integrity_warning."""
        text = PANEL.read_text()
        self.assertIn(
            "data_integrity?.action",
            text,
            "LearningLoopPanel must check data_integrity?.action for action corruption",
        )
        self.assertIn(
            "data_integrity?.outcome",
            text,
            "LearningLoopPanel must check data_integrity?.outcome for outcome corruption",
        )
        self.assertNotIn(
            "data_integrity_warning",
            text,
            "LearningLoopPanel must NOT use old shared data_integrity_warning",
        )

    def test_types_have_stage_specific_data_integrity(self):
        """types.ts must include data_integrity with action/outcome fields,
        NOT the old data_integrity_warning."""
        text = TYPES.read_text()
        self.assertIn(
            "data_integrity",
            text,
            "LearningLoopEntry type must have data_integrity field",
        )
        self.assertNotIn(
            "data_integrity_warning",
            text,
            "LearningLoopEntry must NOT have old data_integrity_warning field",
        )

    def test_types_action_fields_non_optional(self):
        """action_kind and status must be non-optional (backend guarantees them
        or sets data_integrity.action)."""
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
        (backend guarantees them or sets data_integrity.outcome)."""
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

    def test_no_actions_executed_label(self):
        """Panel must NOT use 'Actions executed' — that conflates existence
        with execution. Use 'Actions created' + 'Executed' instead."""
        text = PANEL.read_text()
        self.assertNotIn(
            "Actions executed",
            text,
            "Panel must NOT label action count as 'Actions executed'",
        )
        self.assertIn(
            "Actions created",
            text,
            "Panel must label action count as 'Actions created'",
        )
        self.assertIn(
            "Executed",
            text,
            "Panel must have separate 'Executed' metric",
        )

    def test_executed_uses_succeeded_status(self):
        """Executed metric must filter on action.status === 'succeeded',
        not just action existence."""
        text = PANEL.read_text()
        self.assertIn(
            "succeeded",
            text,
            "Executed metric must check action.status === 'succeeded'",
        )

    def test_no_success_rate_label(self):
        """Panel must NOT use 'Success rate' — improved/measured is a positive
        outcome rate, not success. Use 'Positive outcome rate' instead."""
        text = PANEL.read_text()
        self.assertNotIn(
            "Success rate",
            text,
            "Panel must NOT label improved/measured as 'Success rate'",
        )
        self.assertIn(
            "Positive outcome rate",
            text,
            "Panel must label improved/measured as 'Positive outcome rate'",
        )


if __name__ == "__main__":
    unittest.main()
