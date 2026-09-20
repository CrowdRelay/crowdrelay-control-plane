#!/usr/bin/env python3
"""Pin the ninety-day guarantee's honesty invariants.

The landing contract reads "if after ninety days your fan graph has not
grown, we refund every month you paid." A guarantee that lives in prose is a
promise; a guarantee that lives in a query is a product. The query is only
worth trusting while these hold:

- the baseline is written exactly once, by the first heartbeat that reports a
  fan-graph level — a later report must not be able to move the number the
  tenant is judged against;
- the verdict is derived on read, never stored — a stored verdict could
  quietly disagree with the numbers behind it;
- "not observed" stays NULL end to end — a workspace that never produced an
  activation KPI row must not freeze a baseline of zero, and a heartbeat that
  does not carry the level must not erase the last known one.

Cross-repo: the gauge is emitted by CrowdRelay and forwarded by
`report-control-plane-runtime.sh`; the sibling checkout is optional (the same
convention as the north-star vocabulary parity gate), but when present the
emit-when-observed invariant is pinned too.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CROWDRELAY = ROOT.parent / "crowdrelay"
MIGRATION = ROOT / "migrations" / "0027_tenant_guarantee.sql"
STORE = ROOT / "crates/control-plane-api/src/store.rs"
MODEL = ROOT / "crates/control-plane-api/src/model.rs"
VALIDATION = ROOT / "crates/control-plane-api/src/validation.rs"
ROUTES = ROOT / "crates/control-plane-api/src/routes.rs"
REPORT_SCRIPT = CROWDRELAY / "scripts/report-control-plane-runtime.sh"
CTL = CROWDRELAY / "crowdrelayctl"
API_LIB = CROWDRELAY / "crates/crowdrelay-api/src/lib.rs"


class GuaranteeContract(unittest.TestCase):
    def test_migration_creates_one_frozen_guarantee_per_tenant(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("control_plane_tenant_guarantee", sql)
        # One row per tenant — the primary key is what makes ON CONFLICT the
        # freeze.
        self.assertRegex(sql, r"tenant_id uuid PRIMARY KEY")
        for column in ("metric_key", "baseline_value", "baseline_captured_at", "deadline"):
            self.assertIn(column, sql)
        self.assertIn("north_star_fans", sql)

    def test_no_stored_verdict(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")
        # Column definitions only — comments discuss the verdict precisely to
        # explain why it is not stored.
        without_comments = re.sub(r"--[^\n]*", "", sql)
        table = without_comments.split("control_plane_tenant_guarantee", 1)[1]
        # A stored verdict could disagree with its own baseline and deadline;
        # the state is derived on read and must have nowhere to live.
        self.assertNotRegex(table, r"\b(verdict|state|status|refund)\b")

    def test_freeze_is_insert_once(self) -> None:
        source = STORE.read_text(encoding="utf-8")
        freeze = re.search(
            r"INSERT INTO control_plane_tenant_guarantee.*?ON CONFLICT \(tenant_id\) DO NOTHING",
            source,
            re.DOTALL,
        )
        self.assertIsNotNone(
            freeze,
            "the guarantee baseline must be INSERT … ON CONFLICT DO NOTHING — "
            "a later heartbeat must not move the number the tenant is judged against",
        )
        # And the insert must be gated on the report actually carrying a level.
        self.assertRegex(source, r"if let Some\(fans\) = input\.north_star_fans")

    def test_runtime_upsert_preserves_unknown(self) -> None:
        source = STORE.read_text(encoding="utf-8")
        # north_star_fans follows the same stale/null rules as every runtime
        # column: an old report cannot win, and a report without the level
        # cannot erase the last known one.
        self.assertIn(
            "COALESCE(EXCLUDED.north_star_fans, control_plane_runtime_status.north_star_fans)",
            source,
        )

    def test_wire_field_and_validation(self) -> None:
        model = MODEL.read_text(encoding="utf-8")
        self.assertIn("north_star_fans", model)
        validation = VALIDATION.read_text(encoding="utf-8")
        self.assertIn("input.north_star_fans.is_some_and(|value| value < 0)", validation)

    def test_guarantee_is_queryable_per_tenant(self) -> None:
        routes = ROUTES.read_text(encoding="utf-8")
        self.assertIn('"/tenants/{slug}/guarantee"', routes)


@unittest.skipUnless(CROWDRELAY.exists(), "sibling crowdrelay checkout absent")
class CrowdRelaySide(unittest.TestCase):
    def test_report_script_forwards_the_level(self) -> None:
        script = REPORT_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("northStarFans", script)
        # Serialized through json_counter — absent stays null, never a
        # manufactured zero.
        self.assertIn('json_counter "${NORTH_STAR_FANS:-}"', script)

    def test_ctl_parses_the_gauge(self) -> None:
        ctl = CTL.read_text(encoding="utf-8")
        self.assertIn("crowdrelay_brain_north_star_fans", ctl)

    def test_gauge_is_emitted_only_when_observed(self) -> None:
        lib = API_LIB.read_text(encoding="utf-8")
        self.assertIn("if let Some(fans) = ops_snapshot.brain_north_star_fans", lib)


if __name__ == "__main__":
    unittest.main()
