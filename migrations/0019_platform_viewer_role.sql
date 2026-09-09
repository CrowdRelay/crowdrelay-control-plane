-- Add a read-only platform_viewer role: same tenant scope as platform_admin
-- (NULL tenant_id = all tenants) but the auth middleware blocks all
-- non-GET/HEAD/OPTIONS requests for this identity. Used for read-only
-- observer accounts that need to see every tenant without mutating state.
ALTER TABLE control_plane_operator_accounts
    DROP CONSTRAINT operator_role_scope_check;
ALTER TABLE control_plane_operator_accounts
    ADD CONSTRAINT operator_role_scope_check CHECK (
        (role IN ('platform_admin', 'platform_viewer') AND tenant_id IS NULL)
        OR (role = 'tenant_operator' AND tenant_id IS NOT NULL)
    );
ALTER TABLE control_plane_operator_accounts
    DROP CONSTRAINT control_plane_operator_accounts_role_check;
ALTER TABLE control_plane_operator_accounts
    ADD CONSTRAINT control_plane_operator_accounts_role_check
    CHECK (role IN ('platform_admin', 'platform_viewer', 'tenant_operator'));
