-- Tenant instance provisioning worker state. The HTTP API never receives Docker
-- access; a separately authenticated provisioner claims approved jobs and
-- executes a fixed deployment recipe on the host.

ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS default_country_code text NOT NULL DEFAULT 'PL';

ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_tenant_country_ck;
ALTER TABLE control_plane_tenants
    ADD CONSTRAINT control_plane_tenant_country_ck
    CHECK (default_country_code ~ '^[A-Z]{2}$');

ALTER TABLE control_plane_provisioning_jobs
    ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS claimed_by text NULL,
    ADD COLUMN IF NOT EXISTS claim_token_hash bytea NULL,
    ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS started_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS finished_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS result jsonb NULL,
    ADD COLUMN IF NOT EXISTS error_code text NULL,
    ADD COLUMN IF NOT EXISTS error_detail text NULL;

-- Old v1 code had no execution agent or lease protocol. Any legacy `running`
-- row therefore cannot represent a valid live claim. Normalize it back to the
-- approved queue before introducing the claim invariant.
UPDATE control_plane_provisioning_jobs
SET status = 'approved', claimed_by = NULL, claim_token_hash = NULL, lease_expires_at = NULL,
    started_at = NULL, updated_at = now()
WHERE status = 'running' AND (claim_token_hash IS NULL OR lease_expires_at IS NULL);

ALTER TABLE control_plane_provisioning_jobs
    DROP CONSTRAINT IF EXISTS control_plane_provision_attempt_ck;
ALTER TABLE control_plane_provisioning_jobs
    ADD CONSTRAINT control_plane_provision_attempt_ck
    CHECK (attempt_count >= 0 AND attempt_count <= 10);

ALTER TABLE control_plane_provisioning_jobs
    DROP CONSTRAINT IF EXISTS control_plane_provision_claim_ck;
ALTER TABLE control_plane_provisioning_jobs
    ADD CONSTRAINT control_plane_provision_claim_ck
    CHECK (
        (status = 'running' AND claimed_by IS NOT NULL AND claim_token_hash IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR
        (status <> 'running' AND claim_token_hash IS NULL AND lease_expires_at IS NULL)
    );

ALTER TABLE control_plane_provisioning_jobs
    DROP CONSTRAINT IF EXISTS control_plane_provision_error_ck;
ALTER TABLE control_plane_provisioning_jobs
    ADD CONSTRAINT control_plane_provision_error_ck
    CHECK (
        (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 96)
        AND (error_detail IS NULL OR char_length(error_detail) <= 1000)
    );

CREATE INDEX IF NOT EXISTS control_plane_provisioning_claim_idx
    ON control_plane_provisioning_jobs(status, created_at)
    WHERE status IN ('approved', 'running');
