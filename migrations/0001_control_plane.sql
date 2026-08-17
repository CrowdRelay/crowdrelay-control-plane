CREATE TABLE IF NOT EXISTS control_plane_tenants (
    id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    display_name text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    workspace_id uuid NULL,
    crowdrelay_base_url text NULL,
    signal_base_url text NULL,
    branding_palette jsonb NULL,
    synesthesia_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT control_plane_tenant_slug_ck CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
    CONSTRAINT control_plane_tenant_status_ck CHECK (status IN ('provisioning', 'active', 'suspended')),
    CONSTRAINT control_plane_synesthesia_virya_only_ck CHECK (NOT synesthesia_enabled OR slug = 'virya')
);

CREATE UNIQUE INDEX IF NOT EXISTS control_plane_tenant_workspace_uidx
    ON control_plane_tenants(workspace_id) WHERE workspace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS control_plane_runtime_status (
    tenant_id uuid PRIMARY KEY REFERENCES control_plane_tenants(id) ON DELETE CASCADE,
    api_healthy boolean NULL,
    worker_healthy boolean NULL,
    schema_version integer NULL,
    deployed_sha text NULL,
    outbox_pending bigint NULL,
    queue_lag bigint NULL,
    last_heartbeat_at timestamptz NULL,
    checked_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS control_plane_provisioning_jobs (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES control_plane_tenants(id) ON DELETE CASCADE,
    status text NOT NULL,
    desired_version text NULL,
    plan jsonb NOT NULL,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT control_plane_provision_status_ck CHECK (status IN ('planned', 'approved', 'running', 'succeeded', 'failed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS control_plane_provisioning_jobs_tenant_idx
    ON control_plane_provisioning_jobs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS control_plane_audit_log (
    id uuid PRIMARY KEY,
    tenant_id uuid NULL REFERENCES control_plane_tenants(id) ON DELETE SET NULL,
    actor text NOT NULL,
    action text NOT NULL,
    target_kind text NOT NULL,
    target_id text NOT NULL,
    request_id text NULL,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS control_plane_audit_tenant_idx
    ON control_plane_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS control_plane_audit_created_idx
    ON control_plane_audit_log(created_at DESC);
