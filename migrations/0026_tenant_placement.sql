-- Tenant placement decides which database infrastructure a provisioned stack
-- runs against. `dedicated` is the historical shape: the tenant's compose
-- project carries its own postgres container and volume. `shared_pg` puts the
-- tenant's data in its own database and role on a shared cluster container
-- (`crowdrelay-tenants-pg`) while api+worker stay dedicated per tenant —
-- the runtime is single-workspace-pinned, so the shareable layer today is the
-- database, not the app.
--
-- The default stays `dedicated` so existing rows and any caller that does not
-- know about placement keep the strong-isolation shape; self-serve creation
-- picks `shared_pg` explicitly by archetype. `placement_cluster` names which
-- shared cluster hosts the tenant database and is required for shared rows so
-- a missing cluster can never mean "some default somewhere".
ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'dedicated'
        CHECK (placement IN ('dedicated', 'shared_pg')),
    ADD COLUMN IF NOT EXISTS placement_cluster text NULL,
    ADD COLUMN IF NOT EXISTS placement_database text NULL;

ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_tenant_placement_ck;
ALTER TABLE control_plane_tenants
    ADD CONSTRAINT control_plane_tenant_placement_ck
    CHECK (
        (placement = 'shared_pg' AND placement_cluster IS NOT NULL AND placement_database IS NOT NULL)
        OR
        (placement = 'dedicated' AND placement_cluster IS NULL AND placement_database IS NULL)
    );
