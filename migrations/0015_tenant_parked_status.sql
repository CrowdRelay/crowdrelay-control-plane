-- Tenant park status: a non-destructive freeze for billing/offboarding.
-- Distinct from 'suspended' (manual operator suspension). When parked, the
-- autopilot brain stops producing new tasks and agent_enabled is set to
-- false. The tenant's data and configuration are preserved; a single
-- resume restores the exact envelope/posture captured at park time.

ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_tenant_status_ck,
    ADD CONSTRAINT control_plane_tenant_status_ck
        CHECK (status IN ('provisioning', 'active', 'suspended', 'parked'));

-- Snapshot of the autopilot envelope at park time, so resume restores the
-- exact agent_enabled/dry_run/posture the tenant had before parking.
CREATE TABLE IF NOT EXISTS control_plane_tenant_park_snapshot (
    tenant_id uuid PRIMARY KEY REFERENCES control_plane_tenants(id) ON DELETE CASCADE,
    parked_at timestamptz NOT NULL DEFAULT now(),
    parked_by text NOT NULL,
    agent_enabled boolean NOT NULL,
    dry_run boolean NOT NULL,
    posture text NOT NULL,
    envelope_version bigint NOT NULL,
    reason text,
    unparked_at timestamptz NULL,
    unparked_by text NULL
);
