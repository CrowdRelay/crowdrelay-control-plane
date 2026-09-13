#!/usr/bin/env python3
"""`WIDEST_FAN_OUT` must match the widest fan-out that actually exists.

`tenant_area_client.rs` asserts `POOL_MAX_PER_TARGET >= WIDEST_FAN_OUT` at
compile time, which is the right invariant and only half of it. The assert
protects the pool against the *constant*; nothing protects the constant against
the code. Add a tenth arm to the operations page's `tokio::join!` and the
constant stays at nine, the assert still passes, and the page silently runs in
two waves again — paying a round trip per wave, which is the regression the
constant was introduced to prevent (see BUG_TRACKER P18).

So this counts the arms of every `tokio::join!` in the crate and compares the
widest against the declared constant.

Counting is done with comments stripped. A first version of this counter reported
twelve arms for a nine-arm join because the block carries an explanatory comment
containing three commas at depth zero — a reminder that the naive count is wrong
on exactly the code that most needs a comment.
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CRATES = ROOT / "crates"
CLIENT = CRATES / "control-plane-api/src/tenant_area_client.rs"


def strip_comments(source: str) -> str:
    """Removes `//` and `/* */` comments.

    Not a Rust parser: a `//` inside a string literal would be stripped too.
    That would under-count, and under-counting cannot make this gate pass while
    the code is wrong — the widest join is built from function calls, not string
    literals.
    """
    out: list[str] = []
    index, length = 0, len(source)
    while index < length:
        if source.startswith("//", index):
            newline = source.find("\n", index)
            index = length if newline < 0 else newline
        elif source.startswith("/*", index):
            end = source.find("*/", index)
            index = length if end < 0 else end + 2
        else:
            out.append(source[index])
            index += 1
    return "".join(out)


def join_sites() -> list[tuple[int, str, int]]:
    """(arm count, file, line) for every `tokio::join!` / `try_join!`."""
    sites: list[tuple[int, str, int]] = []
    for path in sorted(CRATES.rglob("*.rs")):
        if "target" in path.parts:
            continue
        text = strip_comments(path.read_text())
        for match in re.finditer(r"tokio::(?:try_)?join!\(", text):
            open_paren = match.end() - 1
            depth = 0
            body = None
            for cursor in range(open_paren, len(text)):
                if text[cursor] == "(":
                    depth += 1
                elif text[cursor] == ")":
                    depth -= 1
                    if depth == 0:
                        body = text[open_paren + 1 : cursor]
                        break
            if body is None:
                continue
            depth, arms = 0, 1
            for char in body:
                if char in "([{":
                    depth += 1
                elif char in ")]}":
                    depth -= 1
                elif char == "," and depth == 0:
                    arms += 1
            if body.rstrip().endswith(","):
                arms -= 1
            line = text[: match.start()].count("\n") + 1
            sites.append((arms, str(path.relative_to(ROOT)), line))
    return sites


def declared(name: str) -> int:
    match = re.search(rf"const {name}: usize = (\d+);", CLIENT.read_text())
    if match is None:
        raise AssertionError(f"{name} is not declared in {CLIENT.name}")
    return int(match.group(1))


class FanOutBudgetContract(unittest.TestCase):
    def test_the_counter_finds_the_join_sites(self):
        """If this is zero the rest of the file proves nothing."""
        sites = join_sites()
        self.assertGreaterEqual(
            len(sites), 5, f"expected several join sites, found {len(sites)}"
        )

    def test_the_declared_widest_fan_out_matches_the_code(self):
        sites = join_sites()
        widest, path, line = max(sites)
        self.assertEqual(
            widest,
            declared("WIDEST_FAN_OUT"),
            f"WIDEST_FAN_OUT says {declared('WIDEST_FAN_OUT')} and the widest "
            f"join is {widest} arms at {path}:{line}. The compile-time assert "
            "compares the pool against this constant, so a stale constant lets "
            "a page run in waves while the build stays green.",
        )

    def test_the_pool_still_covers_the_widest_fan_out(self):
        """The invariant the compile-time assert holds, restated against the
        measured arm count rather than the declared one."""
        widest, path, line = max(join_sites())
        pool = declared("POOL_MAX_PER_TARGET")
        self.assertGreaterEqual(
            pool,
            widest,
            f"the {widest}-arm join at {path}:{line} is wider than the "
            f"{pool}-connection budget, so it runs in waves and pays a round "
            "trip per wave",
        )


if __name__ == "__main__":
    unittest.main()
