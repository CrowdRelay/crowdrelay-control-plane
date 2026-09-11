#!/usr/bin/env python3
"""No shipped default may name a blue/green colour of the CrowdRelay API.

The CrowdRelay API runs blue/green deploys. Which concrete container is serving
traffic — `crowdrelay-api-1` or `crowdrelay-api-green-1` — changes on every
swap, so anything that names a colour works until the next deploy and then
points at a container that no longer exists.

`crowdrelay-api-active` is the alias both colours declare on the
`crowdrelay-shared` network for exactly this reason. This gate exists because
migration 0016 seeded the platform health probe with `crowdrelay-api-1`, which
made the operator console report the CrowdRelay API as permanently down after a
swap to green while it was serving fans normally. 0022 repaired the row; this
stops the next one.

Deliberately narrow: only shipped defaults are checked — migrations, compose
files and env templates. Deploy scripts legitimately mention the colours,
because swapping them is their job, and the prose in docs and comments has to
be able to name what it is warning about.
"""

import os
import re
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A colour-specific container name for the CrowdRelay API. `-active` is the
# alias we want and must not match.
COLOURED = re.compile(r"crowdrelay-api-(?:\d+|green|blue)(?:-\d+)?\b")

# Files whose contents become runtime configuration.
#
# The deploy scripts are checked too. The gate covered migrations and compose
# defaults only, so `ensure-virya-management-credentials.sh` could inspect
# `crowdrelay-api-blue-1` and `crowdrelay-api-green-1` by name and pass. It
# did, and production runs neither — the container is `crowdrelay-api-1` — so
# the credential preflight reported "no CrowdRelay API container running"
# against a healthy API and blocked the Control Plane phase of the ecosystem
# deploy. A script that looks a container up by colour is the same defect as a
# config file that names one.
CHECKED_DIRS = ("migrations", "scripts")
CHECKED_FILES = (
    "docker-compose.yml",
    ".env.example",
)

# Two migrations name a colour and must keep doing so.
#
# 0016 is the migration that seeded the bad value. SQLx checksums applied
# migrations, so it cannot be edited — 0022 repairs the row instead.
#
# 0022 is that repair. Its `WHERE url IN (...)` has to list the colour-specific
# URLs it is looking for; a repair cannot find a value it is forbidden to name.
EXEMPT = {
    "migrations/0016_crowdrelay_api_platform_health.sql",
    "migrations/0022_crowdrelay_api_health_blue_green_alias.sql",
}


def _shipped_config_files():
    paths = []
    for directory in CHECKED_DIRS:
        full = os.path.join(REPO, directory)
        if not os.path.isdir(full):
            continue
        for name in sorted(os.listdir(full)):
            if name.endswith((".sql", ".sh")):
                paths.append(os.path.join(full, name))
    for name in CHECKED_FILES:
        full = os.path.join(REPO, name)
        if os.path.isfile(full):
            paths.append(full)
    return paths


def _offending_lines(path):
    """Lines that name a colour outside a comment.

    A comment may name a colour — 0022's own comment explains which names it is
    repairing, and that explanation is the point of the file.
    """
    offences = []
    with open(path, encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if stripped.startswith("--") or stripped.startswith("#"):
                continue
            if COLOURED.search(line):
                offences.append((number, stripped))
    return offences


class BlueGreenAliasContract(unittest.TestCase):
    def test_no_shipped_default_names_a_colour(self):
        failures = []
        for path in _shipped_config_files():
            relative = os.path.relpath(path, REPO).replace(os.sep, "/")
            if relative in EXEMPT:
                continue
            for number, line in _offending_lines(path):
                failures.append(f"{relative}:{number}: {line}")
        self.assertEqual(
            [],
            failures,
            "Use the blue/green alias `crowdrelay-api-active` instead of a "
            "colour-specific container name:\n  " + "\n  ".join(failures),
        )

    def test_the_repair_migration_targets_the_alias(self):
        """0016 seeded a colour; 0022 must move it to the alias."""
        path = os.path.join(
            REPO, "migrations", "0022_crowdrelay_api_health_blue_green_alias.sql"
        )
        self.assertTrue(os.path.isfile(path), "repair migration 0022 is missing")
        with open(path, encoding="utf-8") as handle:
            body = handle.read()
        self.assertIn("crowdrelay-api-active:8080/v1/health/ready", body)
        self.assertIn("control_plane_platform_health", body)

    def test_every_exempt_file_exists(self):
        """An exemption for a file that no longer exists is a silent hole."""
        for relative in sorted(EXEMPT):
            self.assertTrue(
                os.path.isfile(os.path.join(REPO, relative)),
                f"{relative} is exempt but missing — drop the exemption",
            )

    def test_the_regex_accepts_the_alias_and_rejects_the_colours(self):
        self.assertIsNone(COLOURED.search("http://crowdrelay-api-active:8080"))
        for bad in (
            "http://crowdrelay-api-1:8080",
            "http://crowdrelay-api-green-1:8080",
            "http://crowdrelay-api-blue-1:8080",
        ):
            self.assertIsNotNone(COLOURED.search(bad), bad)


if __name__ == "__main__":
    unittest.main()
