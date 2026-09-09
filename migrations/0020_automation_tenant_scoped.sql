-- Make automation events and workflow configs tenant-scoped.
--
-- Previously both tables were global: every n8n workflow across every
-- tenant/project was visible to every platform operator. That leaked
-- workflows from other tenants (e.g. "kern") into the shared surface.
--
-- This migration adds a nullable tenant_id column, backfills all existing
-- rows to the first tenant (virya), then constrains NOT NULL and adds
-- indexes for the tenant-scoped read path.
--
-- The backfill is guarded: if there are zero rows in the table (fresh
-- install) or zero tenants (should not happen — ensure_virya runs after
-- migrate, but guard anyway), the NOT NULL constraint is skipped via
-- DO block so the migration does not crash on a fresh database.

-- Events: add tenant_id, backfill, constrain.
ALTER TABLE control_plane_automation_events
    ADD COLUMN tenant_id uuid;

UPDATE control_plane_automation_events
    SET tenant_id = (SELECT id FROM control_plane_tenants ORDER BY created_at LIMIT 1)
    WHERE tenant_id IS NULL;

-- Only enforce NOT NULL if there are existing rows. A fresh database
-- has zero rows so the constraint is vacuously satisfiable, but if the
-- subquery returned NULL the UPDATE was a no-op and NOT NULL would fail.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM control_plane_automation_events) THEN
        ALTER TABLE control_plane_automation_events
            ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
END $$;

ALTER TABLE control_plane_automation_events
    ADD CONSTRAINT automation_events_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES control_plane_tenants(id) ON DELETE CASCADE;

CREATE INDEX automation_events_tenant_idx
    ON control_plane_automation_events(tenant_id, occurred_at DESC);

-- Workflow config: add tenant_id, backfill, constrain.
ALTER TABLE control_plane_automation_workflow_config
    ADD COLUMN tenant_id uuid;

UPDATE control_plane_automation_workflow_config
    SET tenant_id = (SELECT id FROM control_plane_tenants ORDER BY created_at LIMIT 1)
    WHERE tenant_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM control_plane_automation_workflow_config) THEN
        ALTER TABLE control_plane_automation_workflow_config
            ALTER COLUMN tenant_id SET NOT NULL;
    END IF;
END $$;

ALTER TABLE control_plane_automation_workflow_config
    ADD CONSTRAINT automation_workflow_config_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES control_plane_tenants(id) ON DELETE CASCADE;

-- The primary key was (workflow_id) globally; now it must be
-- (tenant_id, workflow_id) so the same n8n workflow ID can exist
-- independently under different tenants.
ALTER TABLE control_plane_automation_workflow_config
    DROP CONSTRAINT control_plane_automation_workflow_config_pkey;

ALTER TABLE control_plane_automation_workflow_config
    ADD PRIMARY KEY (tenant_id, workflow_id);

CREATE INDEX automation_workflow_config_tenant_idx
    ON control_plane_automation_workflow_config(tenant_id);
