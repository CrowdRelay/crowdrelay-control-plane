#[test]
fn control_plane_never_models_synesthesia_as_generic_tenant_toggle() {
    let migration = include_str!("../../../migrations/0001_control_plane.sql");
    assert!(migration.contains("NOT synesthesia_enabled OR slug = 'virya'"));
}
