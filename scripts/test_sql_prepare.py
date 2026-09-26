#!/usr/bin/env python3
"""Every SQL statement the API sends prepares against the migrated schema.

The store uses runtime `sqlx::query*` calls, so nothing checks a statement
against the schema before it runs. `platform_health_summary` selected a
`status` column that `control_plane_platform_health` has never had (the
column is `last_status`); it compiled, linted and passed every test, failed on
every call, and `/metrics` turned the error into `0` services for as long as
it existed.

This extracts each literal passed to `sqlx::query`, `query_as` or
`query_scalar` under `crates/`, and `PREPARE`s it — parameters untyped, so
PostgreSQL infers them — against the local control-plane database, which is
what a real request would hit first. A statement assembled with `format!` is
skipped: its text is not known until runtime; so is a session `SET`, which
PREPARE does not accept. Skips without the local
`crowdrelay-control-plane-postgres-1` container; run `just migrate` (or bring
the stack up) first, since a stale schema is exactly what this reads.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = os.environ.get("CONTROL_PLANE_PG_CONTAINER", "crowdrelay-control-plane-postgres-1")
DATABASE = os.environ.get("CONTROL_PLANE_PG_DATABASE", "control_plane")

# Direct-psql mode: when CONTROL_PLANE_PG_HOST is set, prepare against that
# server instead of `docker exec`-ing the local compose container. CI wires
# this to its own migrated service database so the gate validates the PR's
# schema — not whatever ambient stack happens to sit on the host.
PG_HOST = os.environ.get("CONTROL_PLANE_PG_HOST", "")
PG_PORT = os.environ.get("CONTROL_PLANE_PG_PORT", "5432")
PG_USER = os.environ.get("CONTROL_PLANE_PG_USER", "control_plane")

QUERY = re.compile(
    r"sqlx::query(?:_as|_scalar)?(?:::<[^;{}]*?>)?\(\s*"
    r'(?:r#"(?P<raw>.*?)"#|"(?P<plain>(?:[^"\\]|\\.)*)")',
    re.S,
)

UTILITY = re.compile(r"(?:SET|RESET|SHOW|LISTEN|UNLISTEN|NOTIFY|LOCK|DISCARD)\b", re.I)


def unescape(plain: str) -> str:
    # A trailing backslash continues a Rust string literal and eats the
    # newline plus the next line's leading whitespace.
    plain = re.sub(r"\\\n\s*", "", plain)
    return plain.replace('\\"', '"').replace("\\n", "\n").replace("\\t", "\t").replace("\\\\", "\\")


def statements() -> list[tuple[str, int, str]]:
    found = []
    for path in sorted((ROOT / "crates").rglob("*.rs")):
        relative = path.relative_to(ROOT).as_posix()
        text = path.read_text(errors="ignore")
        for match in QUERY.finditer(text):
            sql = match.group("raw") if match.group("raw") is not None else unescape(match.group("plain"))
            sql = sql.strip().rstrip(";")
            if UTILITY.match(sql):
                continue  # Session settings are not preparable, and name no schema.
            line = text[: match.start()].count("\n") + 1
            found.append((relative, line, sql))
    return found


def database_reachable() -> bool:
    if PG_HOST:
        try:
            ready = subprocess.run(
                ["pg_isready", "-h", PG_HOST, "-p", PG_PORT, "-d", DATABASE],
                capture_output=True, text=True, timeout=20,
            )
        except (OSError, subprocess.SubprocessError):
            return False
        return ready.returncode == 0
    try:
        listed = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, timeout=20
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return CONTAINER in listed.stdout.split()


def failures(items: list[tuple[str, int, str]]) -> dict[int, str]:
    script = ["\\set ON_ERROR_STOP 0", "\\set QUIET 1"]
    for index, (_, _, sql) in enumerate(items):
        script.append(f"PREPARE gate_{index} AS {sql};")
        script.append(f"\\if :ERROR\n\\echo FAIL_{index} :LAST_ERROR_MESSAGE\n\\endif")
    script.append("DEALLOCATE ALL;")
    command = (
        ["psql", "-h", PG_HOST, "-p", PG_PORT, "-U", PG_USER, "-d", DATABASE, "-At"]
        if PG_HOST
        else ["docker", "exec", "-i", CONTAINER, "psql", "-U", "control_plane", "-d", DATABASE, "-At"]
    )
    result = subprocess.run(
        command,
        input="\n".join(script), capture_output=True, text=True, timeout=300,
    )
    # A dead psql prints nothing: no FAIL_ markers, an empty found dict, a
    # silent PASS. The transport failing is not the same as zero failures.
    if result.returncode != 0:
        raise RuntimeError(
            f"psql exec failed (rc={result.returncode}): {result.stderr.strip()[:400]}"
        )
    found = {}
    for line in result.stdout.splitlines():
        if line.startswith("FAIL_"):
            marker, _, message = line.partition(" ")
            found[int(marker[5:])] = message
    return found


class SqlPrepares(unittest.TestCase):
    def setUp(self) -> None:
        if not database_reachable():
            target = f"{PG_HOST}:{PG_PORT}/{DATABASE}" if PG_HOST else f"local {CONTAINER} container"
            # A skipped test still prints SQL_PREPARE=PASS, so under CI the
            # missing database is a failure — the gate must prepare against
            # a schema it controls, not pass vacuously on a bare runner.
            if os.environ.get("CI") or os.environ.get("GITHUB_ACTIONS"):
                self.fail(f"no database at {target} — the gate would pass vacuously")
            self.skipTest(f"no {target}")

    def test_every_statement_prepares(self) -> None:
        items = statements()
        self.assertGreater(len(items), 80, f"only {len(items)} statements found; the extractor broke")
        broken = [f"{items[i][0]}:{items[i][1]} {message}" for i, message in sorted(failures(items).items())]
        self.assertEqual(broken, [], "these statements do not prepare against the schema:\n  " + "\n  ".join(broken))


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=0).result
    print("SQL_PREPARE=" + ("PASS" if result.wasSuccessful() else "FAIL"))
    sys.exit(0 if result.wasSuccessful() else 1)
