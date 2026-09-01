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
