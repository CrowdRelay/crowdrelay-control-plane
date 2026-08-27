#!/usr/bin/env python3
"""Source-level security/rollout contract for Control Plane AREA management."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (ROOT / "migrations/0004_area_management.sql").read_text()
CONFIG = (ROOT / "crates/control-plane-api/src/config.rs").read_text()
CLIENT = (ROOT / "crates/control-plane-api/src/tenant_area_client.rs").read_text()
ROUTES = (ROOT / "crates/control-plane-api/src/area_routes.rs").read_text()
STORE = (ROOT / "crates/control-plane-api/src/store.rs").read_text()
PROVISIONER = (ROOT / "deploy/provisioner.py").read_text()
FRONTEND = "\n".join(
    path.read_text()
    for path in (ROOT / "frontend/src").rglob("*.ts*")
    if path.is_file()
)


class AreaManagementContract(unittest.TestCase):
    def test_entitlement_is_additive_and_virya_preserves_existing_runtime(self):
        self.assertIn("area_enabled boolean NOT NULL DEFAULT false", MIGRATION)
        self.assertIn("UPDATE control_plane_tenants SET area_enabled = true WHERE slug = 'virya'", MIGRATION)

    def test_master_key_is_optional_for_transparent_rollout(self):
        self.assertIn("area_management_master_key: Option<String>", CONFIG)
        self.assertIn("optional_secret", CONFIG)
        self.assertIn("if not config.area_management_master_key", PROVISIONER)
        self.assertIn("return", PROVISIONER.split("def ensure_area_management_secret", 1)[1].split("def prepare_files", 1)[0])
        self.assertIn("token != provisioner", CONFIG)

    def test_tokens_are_tenant_scoped_and_browser_never_receives_master(self):
        self.assertIn("crowdrelay-area-admin-v1:", CLIENT)
        self.assertIn("hmac_sha256", CLIENT)
        self.assertIn("derive_area_management_token", PROVISIONER)
        self.assertNotIn("CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY", FRONTEND)
        self.assertNotIn("CROWDRELAY_CONTROL_PLANE_AREA_API_KEY", FRONTEND)

    def test_transport_is_private_bounded_and_refuses_redirects(self):
        for needle in [
            'parsed.scheme() != "http"',
            "private_v4",
            "private_v6",
            "CONNECT_TIMEOUT",
            "REQUEST_TIMEOUT",
            "MAX_RESPONSE_BYTES",
            "upstream redirect refused",
        ]:
            self.assertIn(needle, CLIENT)
        self.assertNotIn("reqwest", CLIENT.lower())  # transport cannot silently follow redirects
        self.assertIn("DefaultBodyLimit::max(MAX_AREA_BODY_BYTES)", ROUTES)
        self.assertIn("16 * 1024", ROUTES)


    def test_management_target_and_secret_are_explicit_before_network_io(self):
        self.assertIn("virya_management_url: Option<String>", CONFIG)
        self.assertIn("CONTROL_PLANE_VIRYA_MANAGEMENT_URL", CONFIG)
        self.assertNotIn('unwrap_or_else(|_| "http://127.0.0.1:8080"', CONFIG)
        request = CLIENT.split("pub async fn request(", 1)[1].split("fn validate_management_target", 1)[0]
        self.assertLess(request.index("self.derived_token(tenant_id)?"), request.index("TcpStream::connect"))

    def test_proxy_validates_drop_ids_before_constructing_upstream_paths(self):
        self.assertIn("fn valid_area_drop_id", ROUTES)
        self.assertIn("fn drop_path", ROUTES)
        self.assertIn('invalid AREA drop id', ROUTES)

    def test_control_plane_does_not_persist_exact_coordinates(self):
        self.assertNotIn("exact_lat", MIGRATION.lower())
        self.assertNotIn("exact_lng", MIGRATION.lower())
        self.assertNotIn("exact_lat", STORE.lower())
        self.assertNotIn("exact_lng", STORE.lower())
        self.assertIn("audit_area_command", STORE)
        audit = STORE.split("pub async fn audit_area_command", 1)[1].split("pub async fn", 1)[0]
        self.assertNotIn("body", audit.lower())
        self.assertNotIn("coordinate", audit.lower())

    def test_local_entitlement_write_returns_only_the_committed_boolean(self):
        method = STORE.split("pub async fn set_area_enabled", 1)[1].split("pub async fn latest_management_url", 1)[0]
        self.assertIn("-> Result<bool, ApiError>", method)
        self.assertIn("Ok(enabled)", method)
        # Do not perform a post-commit tenant reload that could fail after the
        # local write already committed and confuse cross-database compensation.
        self.assertNotIn("tenant_by_slug(slug).await", method.split("tx.commit().await?", 1)[1])

    def test_cross_database_entitlement_write_has_compensation(self):
        settings = ROUTES.split("async fn settings(", 1)[1].split("#[derive(Deserialize)]", 1)[0]
        self.assertIn("let previous = tenant.tenant.area_enabled", settings)
        self.assertIn('json!({"enabled": previous})', settings)
        self.assertIn("compensation failed", settings)
        self.assertIn('"failed"', settings)

    def test_exact_location_editor_is_local_and_cache_is_purged(self):
        self.assertIn("LocationCanvas", FRONTEND)
        for forbidden in ("google.maps", "mapbox", "maplibre", "leaflet", "openstreetmap"):
            self.assertNotIn(forbidden, FRONTEND.lower())
        self.assertIn("gcTime: 0", FRONTEND)
        self.assertIn("removeQueries", FRONTEND)


if __name__ == "__main__":
    unittest.main()
