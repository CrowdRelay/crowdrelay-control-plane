#!/usr/bin/env python3
"""Validate the deploy-bluegreen.sh Caddyfile preflight self-healing logic.

Tests that the script's upstream-pair check and repair logic is correct by
simulating the exact sed expressions the script uses. This catches drift
between the deploy script and the Caddyfile shape before it reaches production.
"""

import os
import re
import subprocess
import sys
import tempfile
import unittest

SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "deploy-bluegreen.sh")

BLUE_APP = "crowdrelay-control-plane-app-1"
GREEN_APP = "crowdrelay-control-plane-app-green-1"
PORT = "8090"

# The canonical Caddyfile upstream snippet shape.
CADDYFILE_TEMPLATE = """\
control.crowdrelay.music {{
# CONTROL_PLANE_ACTIVE={marker}
(cp_upstream) {{
	to {upstream_line}
	lb_policy first
	health_uri /healthz/ready
	health_interval 2s
}}
}}
"""


def heal_upstream(caddyfile_content: str, marker_color: str) -> str:
    """Replicate the self-healing sed from deploy-bluegreen.sh.

    If only one upstream is present, add the missing color. The marker
    determines which color is listed first.
    """
    if marker_color == "green":
        replacement = f"to {GREEN_APP}:{PORT} {BLUE_APP}:{PORT}"
    else:
        replacement = f"to {BLUE_APP}:{PORT} {GREEN_APP}:{PORT}"

    # Match a single-upstream line (no space-separated second upstream)
    pattern = r"^(\s*)to crowdrelay-control-plane-app[a-z0-9-]*:8090\s*$"
    healed, count = re.subn(
        pattern, lambda m: f"{m.group(1)}{replacement}", caddyfile_content, flags=re.MULTILINE
    )
    if count == 0:
        # Already has both upstreams — no heal needed
        return caddyfile_content
    return healed


def has_both_upstreams(content: str) -> bool:
    pair1 = f"to {BLUE_APP}:{PORT} {GREEN_APP}:{PORT}"
    pair2 = f"to {GREEN_APP}:{PORT} {BLUE_APP}:{PORT}"
    return pair1 in content or pair2 in content


class TestDeployBluegreenPreflight(unittest.TestCase):
    """Validate the Caddyfile preflight logic in deploy-bluegreen.sh."""

    def setUp(self):
        # Verify the script exists and has the self-healing code
        with open(SCRIPT_PATH) as f:
            self.script_content = f.read()
        self.assertIn(
            "EDGE_UPSTREAM=HEALED",
            self.script_content,
            "deploy-bluegreen.sh must contain the self-healing logic",
        )

    def test_script_syntax(self):
        """bash -n must pass on the deploy script."""
        result = subprocess.run(
            ["bash", "-n", SCRIPT_PATH], capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, f"bash -n failed: {result.stderr}")

    def test_both_upstreams_present_no_heal_needed(self):
        """A Caddyfile with both upstreams should not be modified."""
        content = CADDYFILE_TEMPLATE.format(
            marker="blue",
            upstream_line=f"{BLUE_APP}:{PORT} {GREEN_APP}:{PORT}",
        )
        healed = heal_upstream(content, "blue")
        self.assertEqual(content, healed)
        self.assertTrue(has_both_upstreams(healed))

    def test_single_blue_upstream_heals_to_pair(self):
        """A Caddyfile with only blue should be healed to include green."""
        content = CADDYFILE_TEMPLATE.format(
            marker="blue",
            upstream_line=f"{BLUE_APP}:{PORT}",
        )
        self.assertFalse(has_both_upstreams(content))
        healed = heal_upstream(content, "blue")
        self.assertTrue(has_both_upstreams(healed))
        # Blue should be first (marker says blue)
        self.assertIn(f"to {BLUE_APP}:{PORT} {GREEN_APP}:{PORT}", healed)

    def test_single_green_upstream_heals_to_pair(self):
        """A Caddyfile with only green should be healed to include blue."""
        content = CADDYFILE_TEMPLATE.format(
            marker="green",
            upstream_line=f"{GREEN_APP}:{PORT}",
        )
        self.assertFalse(has_both_upstreams(content))
        healed = heal_upstream(content, "green")
        self.assertTrue(has_both_upstreams(healed))
        # Green should be first (marker says green)
        self.assertIn(f"to {GREEN_APP}:{PORT} {BLUE_APP}:{PORT}", healed)

    def test_heal_is_idempotent(self):
        """Healing an already-healed Caddyfile should be a no-op."""
        content = CADDYFILE_TEMPLATE.format(
            marker="blue",
            upstream_line=f"{BLUE_APP}:{PORT} {GREEN_APP}:{PORT}",
        )
        healed_once = heal_upstream(content, "blue")
        healed_twice = heal_upstream(healed_once, "blue")
        self.assertEqual(healed_once, healed_twice)

    def test_marker_must_exist(self):
        """The script must check for the CONTROL_PLANE_ACTIVE marker."""
        self.assertIn(
            "# CONTROL_PLANE_ACTIVE=",
            self.script_content,
            "deploy-bluegreen.sh must check for the active marker",
        )

    def test_preflight_check_exists(self):
        """The script must contain the upstream pair check."""
        self.assertIn(
            f"to {BLUE_APP}:{PORT} {GREEN_APP}:{PORT}",
            self.script_content,
            "deploy-bluegreen.sh must reference the blue-green upstream pair",
        )

    def test_rollback_restores_caddyfile(self):
        """The rollback function must restore the Caddyfile from backup."""
        self.assertIn("CADDY_BACKUP", self.script_content)
        self.assertIn("cat \"$CADDY_BACKUP\" > \"$EDGE_CADDYFILE\"", self.script_content)

    def test_cutover_writes_in_place(self):
        """The cutover must use cat (truncate in place) not cp (new inode)."""
        # The cutover step must write with cat, not cp/mv
        self.assertIn('cat "$caddy_candidate" > "$EDGE_CADDYFILE"', self.script_content)


if __name__ == "__main__":
    unittest.main()
