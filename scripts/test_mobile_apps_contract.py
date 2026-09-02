"""Mobile apps contract: Play Store URL fields and the mobile-apps endpoint.

Verifies that:
1. The model declares signal_play_store_url and synesthesia_play_store_url on
   TenantRow, TenantSummaryJoinRow, and CreateTenantRequest.
2. UpdateMobileAppsRequest exists and declares both fields.
3. The store has an update_mobile_apps method.
4. The routes register a PATCH /tenants/{slug}/mobile-apps endpoint.
5. The validation module has a play_store_url function.
6. The synesthesia Virya-only constraint is removed (synesthesia_opt_in accepts
   non-Virya tenants).
7. The frontend Tenant type and CreateTenantInput declare the new fields.
8. The frontend api client has a mobileApps method.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "crates/control-plane-api/src/model.rs"
STORE = ROOT / "crates/control-plane-api/src/store.rs"
ROUTES = ROOT / "crates/control-plane-api/src/routes.rs"
VALIDATION = ROOT / "crates/control-plane-api/src/validation.rs"
MIGRATION = ROOT / "migrations/0011_tenant_mobile_apps.sql"
TYPES_TS = ROOT / "frontend/src/lib/types.ts"
API_TS = ROOT / "frontend/src/lib/api.ts"


def snake_to_camel(value: str) -> str:
    head, *rest = value.split("_")
    return head + "".join(part.title() for part in rest)


class MobileAppsContract(unittest.TestCase):
    def test_migration_adds_columns_and_drops_constraint(self) -> None:
        sql = MIGRATION.read_text(encoding="utf-8")
        self.assertIn("signal_play_store_url", sql)
        self.assertIn("synesthesia_play_store_url", sql)
        self.assertIn("control_plane_synesthesia_virya_only_ck", sql)
        self.assertIn("DROP CONSTRAINT", sql)

    def test_tenant_row_has_play_store_fields(self) -> None:
        source = MODEL.read_text(encoding="utf-8")
        start = source.index("pub struct TenantRow {")
        body = source[start : source.index("\n}", start)]
        self.assertIn("signal_play_store_url", body)
        self.assertIn("synesthesia_play_store_url", body)

    def test_join_row_has_play_store_fields(self) -> None:
        source = MODEL.read_text(encoding="utf-8")
        start = source.index("pub struct TenantSummaryJoinRow {")
        body = source[start : source.index("\n}", start)]
        self.assertIn("signal_play_store_url", body)
        self.assertIn("synesthesia_play_store_url", body)

    def test_create_tenant_request_has_play_store_fields(self) -> None:
        source = MODEL.read_text(encoding="utf-8")
        start = source.index("pub struct CreateTenantRequest {")
        body = source[start : source.index("\n}", start)]
        self.assertIn("signal_play_store_url", body)
        self.assertIn("synesthesia_play_store_url", body)

    def test_update_mobile_apps_request_exists(self) -> None:
        source = MODEL.read_text(encoding="utf-8")
        self.assertIn("pub struct UpdateMobileAppsRequest", source)
        start = source.index("pub struct UpdateMobileAppsRequest {")
        body = source[start : source.index("\n}", start)]
        self.assertIn("signal_play_store_url", body)
        self.assertIn("synesthesia_play_store_url", body)

    def test_into_summary_maps_play_store_fields(self) -> None:
        source = MODEL.read_text(encoding="utf-8")
        self.assertIn("signal_play_store_url: self.signal_play_store_url", source)
        self.assertIn(
            "synesthesia_play_store_url: self.synesthesia_play_store_url", source
        )

    def test_store_has_update_mobile_apps(self) -> None:
        source = STORE.read_text(encoding="utf-8")
        self.assertIn("pub async fn update_mobile_apps", source)
        self.assertIn("tenant.mobile_apps.updated", source)

    def test_store_ensure_virya_seeds_play_urls(self) -> None:
        source = STORE.read_text(encoding="utf-8")
        self.assertIn("music.virya.signal", source)
        self.assertIn("music.virya.synesthesia", source)

    def test_routes_register_mobile_apps_endpoint(self) -> None:
        source = ROUTES.read_text(encoding="utf-8")
        self.assertIn("/tenants/{slug}/mobile-apps", source)
        self.assertIn("async fn update_mobile_apps", source)

    def test_validation_has_play_store_url(self) -> None:
        source = VALIDATION.read_text(encoding="utf-8")
        self.assertIn("pub fn play_store_url", source)

    def test_synesthesia_no_longer_virya_only(self) -> None:
        source = VALIDATION.read_text(encoding="utf-8")
        start = source.index("pub fn synesthesia_opt_in")
        body = source[start : source.index("\n}", start)]
        # The function must not reject non-Virya tenants anymore.
        self.assertNotIn('slug != "virya"', body)
        self.assertNotIn("only available for the virya tenant", body)

    def test_frontend_tenant_type_has_play_store_fields(self) -> None:
        source = TYPES_TS.read_text(encoding="utf-8")
        self.assertIn("signalPlayStoreUrl", source)
        self.assertIn("synesthesiaPlayStoreUrl", source)
        self.assertIn("signalEnabled", source)

    def test_frontend_api_has_mobile_apps_method(self) -> None:
        source = API_TS.read_text(encoding="utf-8")
        self.assertIn("mobileApps:", source)
        self.assertIn("/mobile-apps", source)

    def test_frontend_create_tenant_input_has_play_store_fields(self) -> None:
        source = API_TS.read_text(encoding="utf-8")
        start = source.index("type CreateTenantInput = {")
        body = source[start : source.index("\n}", start)]
        self.assertIn("signalPlayStoreUrl", body)
        self.assertIn("synesthesiaPlayStoreUrl", body)


if __name__ == "__main__":
    unittest.main()
