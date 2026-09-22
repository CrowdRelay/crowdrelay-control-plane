#!/usr/bin/env python3
"""Pin the operator UI's team-skill list to the domain vocabulary.

The tenant wizard collects a crew roster, so the skills it offers have to be
written in TypeScript — there is no CrowdRelay instance to ask during
onboarding. A stale copy would validate here, land in
`control_plane_tenants.team_members`, render into
`CROWDRELAY_TEAM_MEMBERS_JSON`, and then fail the tenant's boot the moment the
Rust config parser met the unknown skill name.

So the copy is allowed, and checked. `TeamSkill::as_str` in
`crowdrelay-domain` is authoritative; this derives the same set from the Rust
source and compares it to `validation::TEAM_SKILLS` and the wizard's
`teamSkills` list.

Skips when the sibling CrowdRelay checkout is absent — standalone
control-plane CI does not require it, the same convention the north-star
vocabulary parity gate uses.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CROWDRELAY = ROOT.parent / "crowdrelay"
DOMAIN = CROWDRELAY / "crates/crowdrelay-domain/src/team_operations.rs"
VALIDATION = ROOT / "crates/control-plane-api/src/validation.rs"
WIZARD = ROOT / "frontend/src/pages/TenantWizardPage.tsx"


def rust_team_skills() -> set[str]:
    """Every value `TeamSkill::as_str` can return."""
    source = DOMAIN.read_text(encoding="utf-8")
    arm = source.split("pub const fn as_str", 1)[1].split("\n    }", 1)[0]
    values = set(re.findall(r'Self::\w+\s*=>\s*"([a-z0-9_]+)"', arm))
    assert values, "no TeamSkill values parsed from team_operations.rs"
    return values


def cp_team_skills() -> set[str]:
    """The `TEAM_SKILLS` const in validation.rs."""
    source = VALIDATION.read_text(encoding="utf-8")
    arm = source.split("pub const TEAM_SKILLS", 1)[1].split("];", 1)[0]
    values = set(re.findall(r'"([a-z0-9_]+)"', arm))
    assert values, "no skills parsed from TEAM_SKILLS"
    return values


def wizard_team_skills() -> set[str]:
    """The `teamSkills` option list in the wizard."""
    source = WIZARD.read_text(encoding="utf-8")
    arm = source.split("const teamSkills", 1)[1].split("];", 1)[0]
    values = set(re.findall(r"value:\s*'([a-z0-9_]+)'", arm))
    assert values, "no skills parsed from the wizard teamSkills list"
    return values


@unittest.skipUnless(DOMAIN.exists(), "sibling crowdrelay checkout not present")
class TeamSkillVocabularyParity(unittest.TestCase):
    def test_cp_validator_matches_domain_vocabulary(self) -> None:
        self.assertEqual(
            cp_team_skills(),
            rust_team_skills(),
            "validation::TEAM_SKILLS drifted from TeamSkill::as_str",
        )

    def test_wizard_matches_domain_vocabulary(self) -> None:
        self.assertEqual(
            wizard_team_skills(),
            rust_team_skills(),
            "wizard teamSkills drifted from TeamSkill::as_str",
        )


if __name__ == "__main__":
    sys.exit(unittest.main())
