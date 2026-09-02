#[test]
fn control_plane_synesthesia_constraint_is_dropped_by_migration_0011() {
    // Migration 0001 originally constrained Synesthesia to the Virya tenant.
    // Migration 0011 drops that constraint so any tenant can opt in.
    let migration_0001 = include_str!("../../../migrations/0001_control_plane.sql");
    assert!(migration_0001.contains("NOT synesthesia_enabled OR slug = 'virya'"));

    let migration_0011 = include_str!("../../../migrations/0011_tenant_mobile_apps.sql");
    assert!(migration_0011.contains("DROP CONSTRAINT"));
    assert!(migration_0011.contains("control_plane_synesthesia_virya_only_ck"));
}
