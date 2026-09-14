-- Tenant lifecycle capabilities replace slug special-casing.
--
-- Until now `tenant_lifecycle_is_externally_owned(slug) == (slug == 'virya')`
-- decided whether a tenant could be suspended, provisioned, or removed. The
-- rules are data now: every tenant carries the three capabilities, and virya
-- is just the row that happens to say its lifecycle is owned elsewhere.
ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS can_suspend boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS can_provision boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS can_remove boolean NOT NULL DEFAULT true;

-- Virya is an ordinary tenant for suspension, but its lifecycle is not owned
-- here: the production deployment predates the tenant agent, so it is never
-- provisioned by it, and the platform tenant is never removed.
UPDATE control_plane_tenants
SET can_suspend = true, can_provision = false, can_remove = false
WHERE slug = 'virya';

-- `latest_management_url` reads the newest succeeded provisioning job that
-- carries result.localApiUrl. Virya's target is registered, not provisioned:
-- ensure_virya upserts one external_registration row per boot, and this index
-- is what lets it be an upsert rather than an append.
CREATE UNIQUE INDEX IF NOT EXISTS control_plane_provisioning_external_registration_idx
    ON control_plane_provisioning_jobs(tenant_id)
    WHERE plan->>'kind' = 'external_registration';

-- The tenant archetype names which loop the machine runs. The loop itself is
-- identical across archetypes; what differs is the per-archetype config the
-- brain reads (north star, peer definition, production events, catalogue
-- order). Stored now so the second tenant's archetype is a column value, not
-- a code change — no per-archetype behaviour ships until a second exists.
ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS archetype text NOT NULL DEFAULT 'band'
        CHECK (archetype IN ('band', 'roster', 'label', 'festival_org'));
