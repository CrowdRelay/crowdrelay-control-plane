-- The ninety-day guarantee becomes data.
--
-- The landing contract reads "if after ninety days your fan graph has not
-- grown, we refund every month you paid." Until now nothing could answer it:
-- the tenant knew its fan-graph level (`viryaos_fan_activation_kpi`, surfaced
-- as the `crowdrelay_brain_north_star_fans` gauge) but the Control Plane —
-- where the refund decision is actually made — never saw the number.
--
-- Two pieces:
--
-- 1. `north_star_fans` on the runtime row, same convention as every runtime
--    column: nullable, because a CrowdRelay that predates the gauge reports
--    nothing, and nothing is a different fact from zero.
--
-- 2. `control_plane_tenant_guarantee`, one row per tenant, written exactly
--    once: the first heartbeat that reports a fan-graph level freezes it as
--    the activation baseline and starts the ninety-day clock. Frozen, not
--    recomputed — a baseline that moves makes the refund argument unwinnable
--    for both sides. The verdict itself is never stored: it is derived on
--    read from the baseline, the deadline, and the latest reported level, so
--    a stored verdict cannot quietly disagree with the numbers behind it.
--
-- The baseline freezes at first *measured* report, not at provisioning: the
-- clock should not run on days the fan graph was never counted. When the
-- payment → provisioning path lands, subscription start can re-anchor the
-- deadline explicitly; until then first-measurement is the honest activation.
ALTER TABLE control_plane_runtime_status
    ADD COLUMN IF NOT EXISTS north_star_fans bigint;

CREATE TABLE IF NOT EXISTS control_plane_tenant_guarantee (
    tenant_id uuid PRIMARY KEY REFERENCES control_plane_tenants(id) ON DELETE CASCADE,
    -- Which series the baseline was frozen under. `activated_fans_30d` today;
    -- stored so a tenant whose guarantee later measures something else keeps
    -- its own number honest instead of silently changing the yardstick.
    metric_key text NOT NULL CHECK (btrim(metric_key) <> '' AND char_length(metric_key) <= 64),
    baseline_value bigint NOT NULL CHECK (baseline_value >= 0),
    baseline_captured_at timestamptz NOT NULL,
    deadline timestamptz NOT NULL CHECK (deadline > baseline_captured_at),
    created_at timestamptz NOT NULL DEFAULT now()
);
