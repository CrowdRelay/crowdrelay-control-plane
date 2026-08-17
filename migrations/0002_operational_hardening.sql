-- Operational hardening is intentionally additive. 0001 may already have been
-- applied on control.virya.music, so changing its checksum would break startup.

-- The old API could create duplicate `planned` jobs. Keep the newest plan and
-- cancel only older *planned* duplicates before enforcing the invariant. We do
-- not silently alter approved/running jobs; if those are duplicated the unique
-- index deliberately fails migration so an operator can inspect the conflict.
WITH ranked_plans AS (
    SELECT
        planned.id,
        planned.tenant_id,
        row_number() OVER (
            PARTITION BY planned.tenant_id
            ORDER BY planned.created_at DESC, planned.id DESC
        ) AS position,
        EXISTS (
            SELECT 1
            FROM control_plane_provisioning_jobs progressed
            WHERE progressed.tenant_id = planned.tenant_id
              AND progressed.status IN ('approved', 'running')
        ) AS has_progressed_job
    FROM control_plane_provisioning_jobs planned
    WHERE planned.status = 'planned'
)
UPDATE control_plane_provisioning_jobs job
SET status = 'cancelled', updated_at = now()
FROM ranked_plans
WHERE job.id = ranked_plans.id
  AND (ranked_plans.has_progressed_job OR ranked_plans.position > 1);

CREATE UNIQUE INDEX IF NOT EXISTS control_plane_provisioning_one_active_uidx
    ON control_plane_provisioning_jobs(tenant_id)
    WHERE status IN ('planned', 'approved', 'running');

ALTER TABLE control_plane_runtime_status
    DROP CONSTRAINT IF EXISTS control_plane_runtime_schema_version_ck;
ALTER TABLE control_plane_runtime_status
    ADD CONSTRAINT control_plane_runtime_schema_version_ck
    CHECK (schema_version IS NULL OR schema_version >= 0);

ALTER TABLE control_plane_runtime_status
    DROP CONSTRAINT IF EXISTS control_plane_runtime_counters_ck;
ALTER TABLE control_plane_runtime_status
    ADD CONSTRAINT control_plane_runtime_counters_ck
    CHECK ((outbox_pending IS NULL OR outbox_pending >= 0)
       AND (queue_lag IS NULL OR queue_lag >= 0));
