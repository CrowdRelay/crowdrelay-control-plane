#!/usr/bin/env python3
"""Pin the operator UI's north-star list to the domain vocabulary.

The tenant wizard creates a tenant, so there is no CrowdRelay instance to ask
for the list of north stars — the options have to be written in TypeScript. That
copy silently stopped matching the backend once the vocabulary widened from four
metrics to seventeen: a tenant measured on SoundCloud could not choose
SoundCloud, because a TypeScript union had never heard of it, and the wizard
quietly wrote a Signal-shaped default instead.

So the copy is allowed, and checked. `NorthStarMetric::all()` is
`SignalInstalls`, `TotalAudience`, and one entry per `MetricPlatform` that
reports an audience size; this derives the same set from the Rust source and
compares it to the wizard's union and option list.

Skips when the sibling CrowdRelay checkout is absent — standalone control-plane
CI does not require it, the same convention the autopilot wire contract uses.
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CROWDRELAY = ROOT.parent / "crowdrelay"
DOMAIN = CROWDRELAY / "crates/crowdrelay-domain/src/growth_metrics.rs"
WIZARD = ROOT / "frontend/src/pages/TenantWizardPage.tsx"
VALIDATION = ROOT / "crates/control-plane-api/src/validation.rs"
MIGRATIONS = ROOT / "migrations"


def rust_north_stars() -> set[str]:
    """Every value `NorthStarMetric::as_str` can return.

    `SignalInstalls` and `TotalAudience` are literals on the enum; the rest come
    from `MetricPlatform::north_star_key`, one per platform that has an audience
    metric key. Platforms without one return `""` and are filtered out by
    `all()`, so they are excluded here too.
    """
    source = DOMAIN.read_text()

    audience = source.split("pub const fn audience_metric_key", 1)[1].split("\n    }", 1)[0]
    without_audience: set[str] = set()
    for arm in re.findall(r"((?:Self::\w+\s*\|\s*)*Self::\w+)\s*=>\s*None", audience):
        without_audience.update(re.findall(r"Self::(\w+)", arm))

    keys = source.split("pub const fn north_star_key", 1)[1].split("\n    }", 1)[0]
    values: set[str] = {"signal_installs", "total_audience"}
    for arm, key in re.findall(r"((?:Self::\w+\s*\|\s*)*Self::\w+)\s*=>\s*\"([a-z0-9_]*)\"", keys):
        if not key:
            continue
        variants = set(re.findall(r"Self::(\w+)", arm))
        if variants & without_audience:
            continue
        values.add(key)
    return values


def validator_list() -> set[str]:
    """`NORTH_STAR_METRICS` in the control-plane's own request validation.

    The third copy, and the one that actually rejects a create call. It sat at
    the original four values while the wizard offered seventeen, so choosing a
    widened goal failed with "unknown northStarMetric" — the UI and the domain
    agreed with each other and the validator between them agreed with neither.
    """
    source = VALIDATION.read_text()
    block = source.split("pub const NORTH_STAR_METRICS", 1)[1].split("];", 1)[0]
    return set(re.findall(r'"([a-z0-9_]+)"', block))


def database_check_list() -> set[str]:
    """The vocabulary `control_plane_tenant_north_star_ck` allows.

    Read from the latest migration that defines the constraint, so a later
    migration widening it is what this test sees.
    """
    definitions = [
        path
        for path in sorted(MIGRATIONS.glob("*.sql"))
        if "ADD CONSTRAINT control_plane_tenant_north_star_ck" in path.read_text()
    ]
    if not definitions:
        raise AssertionError("no migration defines the north-star CHECK")
    source = definitions[-1].read_text()
    start = source.index("ADD CONSTRAINT control_plane_tenant_north_star_ck")
    body = source[start : source.index(";", start)]
    values = set(re.findall(r"'([a-z_]+)'", body))
    if not values:
        raise AssertionError("the north-star CHECK has no values; the parser is wrong")
    return values


def wizard_union() -> set[str]:
    source = WIZARD.read_text()
    # Stop at the next type alias: `FanbaseSource` follows immediately with no
    # blank line between, and its members are not north stars.
    block = source.split("type NorthStar =", 1)[1]
    block = re.split(r"\ntype |\nconst ", block, maxsplit=1)[0]
    return set(re.findall(r"'([a-z0-9_]+)'", block))


def wizard_options() -> list[str]:
    source = WIZARD.read_text()
    block = source.split("const northStars:", 1)[1].split("\n]", 1)[0]
    return re.findall(r"value:\s*'([a-z0-9_]+)'", block)


@unittest.skipUnless(DOMAIN.exists(), "sibling crowdrelay checkout not present")
class NorthStarVocabularyParity(unittest.TestCase):
    def test_the_rust_vocabulary_parsed(self) -> None:
        values = rust_north_stars()
        self.assertGreaterEqual(
            len(values), 10, f"north-star parse produced too few values: {sorted(values)}"
        )
        for expected in ("signal_installs", "total_audience", "soundcloud_followers"):
            self.assertIn(expected, values)

    def test_the_wizard_union_matches_the_domain(self) -> None:
        rust, union = rust_north_stars(), wizard_union()
        self.assertEqual(
            sorted(rust - union),
            [],
            "the domain offers north stars the wizard cannot express; a tenant "
            "measured on one of these cannot select it",
        )
        self.assertEqual(
            sorted(union - rust),
            [],
            "the wizard offers north stars the domain will reject on save",
        )

    def test_every_union_member_is_a_selectable_option(self) -> None:
        options = wizard_options()
        self.assertEqual(
            sorted(wizard_union()),
            sorted(options),
            "a north star in the union but not the option list can never be picked",
        )
        self.assertEqual(
            len(options), len(set(options)), "the wizard lists a north star twice"
        )

    def test_the_validator_accepts_every_domain_north_star(self) -> None:
        """The list that rejects create calls must not be the narrowest one."""
        rust, validator = rust_north_stars(), validator_list()
        self.assertEqual(
            sorted(rust - validator),
            [],
            "the control-plane validator rejects north stars the domain "
            "supports; a tenant picking one of these cannot be created",
        )
        self.assertEqual(
            sorted(validator - rust),
            [],
            "the validator accepts north stars the tenant runtime cannot "
            "parse, which silently fall back to signal_installs",
        )

    def test_the_database_accepts_every_north_star_the_validator_does(self) -> None:
        """The CHECK constraint is the fourth copy, and it fell behind too.

        The validator's own doc comment records this failure once already — the
        wizard offering goals the validator rejected. Adding the parity test
        fixed three copies and left the database out, so the same break moved
        one layer down: `total_audience`, the wizard's default, passed
        validation and then violated
        `control_plane_tenant_north_star_ck`. The operator saw "internal
        error", because a constraint violation is a `sqlx` database error and
        the response withholds the detail.
        """
        validator, database = validator_list(), database_check_list()
        self.assertEqual(
            sorted(validator - database),
            [],
            "the tenants table rejects north stars the validator accepts; "
            "choosing one of these fails at INSERT, after every check passed",
        )
        self.assertEqual(
            sorted(database - validator),
            [],
            "the tenants table permits north stars nothing can produce",
        )

    def test_the_signal_off_fallback_is_not_platform_specific(self) -> None:
        """A tenant with no YouTube channel must not be handed a YouTube goal.

        The fallback fires before any platform is connected, so the only honest
        default is the aggregate.
        """
        source = VALIDATION.read_text()
        self.assertIn('"total_audience"', source)
        self.assertNotIn(
            '} else {\n            "youtube_subscribers"',
            source,
            "the Signal-off fallback still names a single platform",
        )

    def test_the_default_does_not_assume_signal(self) -> None:
        """A tenant that does not use Signal must still get a usable default.

        The wizard used to fall back to `youtube_subscribers` when Signal was
        off, handing a north star to tenants with no YouTube channel.
        `total_audience` is the only metric that means something before anyone
        knows which platforms this tenant will connect.
        """
        source = WIZARD.read_text()
        self.assertIn("createSignal<NorthStar>('total_audience')", source)
        self.assertNotIn("return 'youtube_subscribers' as NorthStar", source)


if __name__ == "__main__":
    result = unittest.main(exit=False, verbosity=0).result
    if result.wasSuccessful():
        count = len(rust_north_stars()) if DOMAIN.exists() else 0
        print(f"NORTH_STAR_VOCABULARY_PARITY=PASS north_stars={count}")
    else:
        print("NORTH_STAR_VOCABULARY_PARITY=FAIL")
        sys.exit(1)
