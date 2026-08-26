#!/usr/bin/env python3
"""Contract tests for the opportunity board — find, then "do it".

Phase 18's operator surface. The Control Plane renders what the CrowdRelay
agent found and parked, and its two buttons stay narrow:

1. "Do it" forwards to CrowdRelay's canonical approval endpoint — one action,
   no second authority path.
2. "Done ourselves" records a human outcome against the finding itself.
3. The board reaches the browser inside the single Operations read model, so
   the subpage still makes exactly one request.
"""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]

OPERATIONS = ROOT / "crates/control-plane-api/src/operations_routes.rs"
READ_MODELS = ROOT / "crates/control-plane-api/src/read_models.rs"
CLIENT = ROOT / "crates/control-plane-api/src/tenant_area_client.rs"
TUNNEL = ROOT / "deploy/virya-area-tunnel.Caddyfile"

API = ROOT / "frontend/src/lib/api.ts"
TYPES = ROOT / "frontend/src/lib/types.ts"
PANEL = ROOT / "frontend/src/components/OpportunityBoardPanel.tsx"
PAGE = ROOT / "frontend/src/pages/TenantOperationsPage.tsx"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class OpportunityBoardContract(unittest.TestCase):
    def setUp(self) -> None:
        self.operations = read(OPERATIONS)
        self.client = read(CLIENT)

    def test_board_reads_the_ranked_queue_through_the_control_plane_surface(self) -> None:
        self.assertIn("/v1/control-plane/autopilot/next-best-actions", self.client.split("fn valid_operations_request", 1)[1])
        self.assertIn('"/v1/control-plane/autopilot/next-best-actions"', read(READ_MODELS))

    def test_do_it_forwards_to_the_canonical_approval_endpoint(self) -> None:
        # One button over one action through CrowdRelay's own approval path;
        # the proxy constructs no authority of its own and sends no body.
        self.assertIn("/v1/control-plane/autopilot/actions/{action_id}/approve", self.operations)
        self.assertIn(
            'uuid_segment_between(path, "/v1/control-plane/autopilot/actions/", "/approve")',
            self.client,
        )

    def test_done_ourselves_records_a_human_outcome(self) -> None:
        self.assertIn("handled-externally", self.operations)
        self.assertIn('"tenant.autopilot_decision.handled_externally"', self.operations)
        allowlist = self.client.split("fn valid_operations_request", 1)[1]
        self.assertIn('"/v1/control-plane/autopilot/decisions/"', allowlist)
        self.assertIn('"/handled-externally"', allowlist)

    def test_both_mutations_require_idempotency_and_audit(self) -> None:
        for handler in ("async fn approve_opportunity", "async fn handle_opportunity_externally"):
            block = self.operations.split(handler, 1)[1].split("\nasync fn", 1)[0]
            self.assertIn("idempotency_key(&headers)", block)
            self.assertIn("audit_result(", block)

    def test_tunnel_routes_every_board_path(self) -> None:
        matcher = read(TUNNEL).split("@operations path", 1)[1].split("\n\n", 1)[0]
        paths = set(re.findall(r"/v1/control-plane/[^\\\s]+", matcher))
        self.assertIn("/v1/control-plane/autopilot/next-best-actions", paths)
        self.assertIn("/v1/control-plane/autopilot/actions/*", paths)
        self.assertIn("/v1/control-plane/autopilot/decisions/*", paths)

    def test_tunnel_matcher_keeps_one_path_per_continuation_line(self) -> None:
        # A lost line break glues two allowlist entries into one token; the
        # regex-based coverage checks still "find" both fragments while Caddy
        # answers every real request with `respond 404`. Each continuation
        # line must therefore carry exactly one path and one trailing slash.
        matcher = read(TUNNEL).split("@operations path", 1)[1].split("\n\n", 1)[0]
        # The first fragment keeps the header line's own trailing "\".
        lines = [line.strip() for line in matcher.splitlines() if line.strip() != "\\"]
        self.assertGreaterEqual(len(lines), 2)
        for index, line in enumerate(lines[:-1]):
            self.assertTrue(
                re.fullmatch(r"/v1/control-plane/\S+ \\", line),
                f"tunnel matcher line {index + 1} is not a single continued path: {line!r}",
            )
            self.assertEqual(line.count("/v1/control-plane/"), 1)
        self.assertTrue(
            re.fullmatch(r"/v1/control-plane/\S+", lines[-1]),
            f"tunnel matcher last line is not a bare path: {lines[-1]!r}",
        )

    def test_browser_gets_one_read_model_with_a_degradable_board(self) -> None:
        types = read(TYPES)
        self.assertIn("'summary' | 'flags' | 'autopilot' | 'growth' | 'opportunities'", types)
        self.assertIn("decision_id: string", types)
        self.assertIn("action_id: string | null", types)

    def test_panel_mounts_on_the_operations_page_and_never_fetches(self) -> None:
        page = read(PAGE)
        panel = read(PANEL)
        self.assertIn("<OpportunityBoardPanel", page)
        self.assertNotIn("useQuery", panel)
        self.assertNotIn("fetch(", panel)
        self.assertIn("api.approveOpportunityAction", panel)
        self.assertIn("api.markOpportunityHandledExternally", panel)

    def test_mutations_send_idempotency_keys_from_the_browser(self) -> None:
        api = read(API)
        for method in ("approveOpportunityAction", "markOpportunityHandledExternally"):
            block = api.split(f"{method}: ", 1)[1].split("}),\n")[0]
            self.assertIn("'idempotency-key': crypto.randomUUID()", block)


if __name__ == "__main__":
    unittest.main()
