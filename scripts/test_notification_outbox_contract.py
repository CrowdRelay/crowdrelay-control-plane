#!/usr/bin/env python3
"""Pin the notifier outbox's emit-side contract.

`enqueue_event_tx` is the only writer of `control_plane_notification_outbox`,
and the event column is guarded by a CHECK constraint. When
`approvals.pending` was added as an emit site nobody extended the allowlist —
every insert violated the constraint inside the heartbeat transaction, so a
tenant whose approval queue grew stopped reporting runtime entirely. The
failure was invisible to every test because the emit side and the schema
side live in different files and neither test suite reads the other.

This contract is the join between them: every event literal passed to
`enqueue_event_tx` must be in the constraint's allowlist, and the allowlist
must live in exactly one place — the newest migration that defines it.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / "crates/control-plane-api/src/store.rs"
ROUTES = ROOT / "crates/control-plane-api/src/routes.rs"
MIGRATIONS = ROOT / "migrations"

EMIT_RE = re.compile(r'enqueue_event_tx\([^)]*?"([a-z_]+\.[a-z_]+)"', re.DOTALL)
ALLOWLIST_RE = re.compile(
    r"control_plane_notification_outbox_event_check\s*CHECK\s*\(event\s+IN\s*\(([^)]*)\)",
    re.IGNORECASE | re.DOTALL,
)


def emit_sites() -> set[str]:
    events: set[str] = set()
    for source in (STORE, ROUTES):
        events.update(EMIT_RE.findall(source.read_text(encoding="utf-8")))
    return events


def allowlist() -> set[str]:
    """The effective allowlist is the newest migration that (re)defines the
    constraint — earlier definitions are superseded by ALTER."""
    newest: set[str] | None = None
    for path in sorted(MIGRATIONS.glob("*.sql")):
        sql = path.read_text(encoding="utf-8")
        match = ALLOWLIST_RE.search(sql)
        if match:
            newest = set(re.findall(r"'([a-z_]+\.[a-z_]+)'", match.group(1)))
    return newest or set()


class NotificationOutboxContract(unittest.TestCase):
    def test_every_emitted_event_is_allowed_by_the_constraint(self) -> None:
        emitted = emit_sites()
        allowed = allowlist()
        self.assertTrue(emitted, "expected to find enqueue_event_tx emit sites")
        self.assertTrue(allowed, "expected to find the event CHECK constraint")
        self.assertEqual(
            emitted - allowed,
            set(),
            "events are emitted that the outbox CHECK constraint rejects — "
            "the insert would fail inside the caller's transaction",
        )

    def test_approvals_pending_is_allowed(self) -> None:
        # The concrete regression: emitted in 0026's report path, rejected by
        # the constraint until 0029.
        self.assertIn("approvals.pending", allowlist())

    def test_dead_rows_and_overdue_pending_have_a_fleet_surface(self) -> None:
        # A dead notification is the silent-churn failure: the channel that
        # would report it is the one that failed. The counts must reach the
        # command-center system block — the one surface an operator always
        # sees.
        read_models = (
            ROOT / "crates/control-plane-api/src/read_models.rs"
        ).read_text(encoding="utf-8")
        self.assertIn("notification_outbox_health", read_models)
        self.assertIn("notificationOutbox", read_models)
        store = STORE.read_text(encoding="utf-8")
        self.assertIn("status = 'dead'", store)
        self.assertIn("next_attempt_at < now() - INTERVAL '15 minutes'", store)

    def test_a_tenant_with_no_enabled_channel_is_surfaced(self) -> None:
        # `enqueue_event_tx` fans out over enabled channels — a tenant with
        # none drops every event silently, and the row-level evidence is that
        # nothing was ever inserted. The count must reach the command-center
        # per-tenant projection so the gap reads as configuration debt, not
        # as quiet.
        read_models = (
            ROOT / "crates/control-plane-api/src/read_models.rs"
        ).read_text(encoding="utf-8")
        self.assertIn("enabledNotifierChannels", read_models)
        store = STORE.read_text(encoding="utf-8")
        self.assertIn("enabled_notifier_channels", store)
        self.assertIn("control_plane_notifier_channels", store)


if __name__ == "__main__":
    unittest.main()
