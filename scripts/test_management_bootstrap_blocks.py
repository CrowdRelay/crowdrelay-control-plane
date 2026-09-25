#!/usr/bin/env python3
"""Every remote shell block defines the helpers it calls.

`ensure-virya-management-credentials.sh` runs several heredoc blocks over
ssh, each in its own remote `bash -s`. A shell function defined in one block
does not exist in the next. The apply block called `api_container`, which only
the check block defined: on 2026-09-25 the bootstrap persisted the keys, then
failed with "api_container: command not found" before reloading anything, so
the Control Plane kept a non-canonical management URL and every ecosystem
deploy stopped at its preflight.
"""
import re
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "ensure-virya-management-credentials.sh"
HELPERS = ("api_container", "absolute_path")


def remote_blocks(text: str) -> dict[str, str]:
    blocks = {}
    for match in re.finditer(r"<<'([A-Z_]+)'\n(.*?)\n\1\n", text, re.S):
        blocks[match.group(1)] = match.group(2)
    return blocks


class RemoteBlocks(unittest.TestCase):
    def test_blocks_were_found(self) -> None:
        blocks = remote_blocks(SCRIPT.read_text())
        self.assertIn("ORACLE_CHECK", blocks)
        self.assertIn("ORACLE_APPLY", blocks)

    def test_each_block_defines_what_it_calls(self) -> None:
        for name, body in remote_blocks(SCRIPT.read_text()).items():
            for helper in HELPERS:
                called = re.search(rf"\b{helper}\b(?!\s*\(\))", body.replace(f"{helper}() {{", ""))
                defined = f"{helper}() {{" in body or f"{helper}() " in body
                if called:
                    self.assertTrue(defined, f"{name} calls {helper} without defining it")


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=0).result
    print("MANAGEMENT_BOOTSTRAP_BLOCKS=" + ("PASS" if result.wasSuccessful() else "FAIL"))
    raise SystemExit(0 if result.wasSuccessful() else 1)
