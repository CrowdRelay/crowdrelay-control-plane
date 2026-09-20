#!/usr/bin/env python3
"""Pin the payment → provisioning path's honesty invariants.

The gate reads "Stripe webhook → control-plane provisioning intent →
workspace live". The translator (n8n) owns Stripe signature verification; the
Control Plane owns the contract. What must stay true:

- every recognized event is recorded on `control_plane_tenant_billing` —
  "what does billing think this tenant is" is a row, never a log line;
- `canceled` and `refunded` are different terminal states — a customer who
  churned is not owed money, a refunded one is;
- `subscription_started` both re-anchors the guarantee to the paid window
  and turns payment into a provisioning intent for a tenant still in
  `provisioning`;
- `refunded` is terminal — only a fresh `subscription_started` resets the
  machine, so a straggler `payment_failed` cannot resurrect a refunded
  subscription as merely behind.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "0028_tenant_billing.sql"
STORE = ROOT / "crates/control-plane-api/src/store.rs"
MODEL = ROOT / "crates/control-plane-api/src/model.rs"
ROUTES = ROOT / "crates/control-plane-api/src/routes.rs"


class BillingContract(unittest.TestCase):
    def test_billing_table_records_the_subscription_machine(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("control_plane_tenant_billing", sql)
        self.assertRegex(sql, r"tenant_id uuid PRIMARY KEY")
        for state in ("trialing", "active", "past_due", "canceled", "refunded"):
            self.assertIn(f"'{state}'", sql)
        # The paid ninety days anchor here.
        self.assertIn("subscription_started_at", sql)

    def test_every_recognized_event_is_recorded(self) -> None:
        routes = ROUTES.read_text(encoding="utf-8")
        events = re.search(r"BILLING_EVENTS[^=]*=\s*&\[(.*?)\]", routes, re.DOTALL)
        self.assertIsNotNone(events, "BILLING_EVENTS allowlist missing")
        for event in (
            "subscription_started",
            "payment_succeeded",
            "payment_failed",
            "subscription_canceled",
            "subscription_refunded",
        ):
            self.assertIn(event, events.group(1))
        # And the machine is applied before any event-specific action.
        self.assertIn("apply_billing_event", routes)

    def test_subscription_start_turns_payment_into_a_provisioning_intent(self) -> None:
        routes = ROUTES.read_text(encoding="utf-8")
        started = routes.split('input.event == "subscription_started"', 1)[1]
        # Re-anchor the guarantee to the paid window…
        self.assertIn("anchor_guarantee_to_subscription", started.split("payment_succeeded")[0])
        # …and create the provisioning intent for a tenant not yet live.
        block = started.split('return Ok(StatusCode::NO_CONTENT)')[0]
        self.assertIn('"provisioning"', block)
        self.assertIn("request_deployment", block)
        self.assertIn("plan_provisioning", block)

    def test_the_freeze_anchors_deadline_to_subscription_start(self) -> None:
        store = STORE.read_text(encoding="utf-8")
        freeze = re.search(
            r"INSERT INTO control_plane_tenant_guarantee.*?ON CONFLICT \(tenant_id\) DO NOTHING",
            store,
            re.DOTALL,
        )
        self.assertIsNotNone(freeze)
        self.assertIn("control_plane_tenant_billing", freeze.group(0))
        self.assertIn("subscription_started_at", freeze.group(0))

    def test_refunded_is_terminal(self) -> None:
        model = MODEL.read_text(encoding="utf-8")
        apply = model.split("pub fn apply(", 1)[1]
        # The refunded guard appears in every non-start event arm — a
        # straggler payment event must not resurrect a refunded subscription.
        self.assertGreaterEqual(apply.count("Some(Self::Refunded) => None"), 2)


if __name__ == "__main__":
    unittest.main()
