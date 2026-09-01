-- Tenant product opt-ins and growth intent captured at onboarding.
--
-- The onboarding wizard has always collected these four values, but
-- CreateTenantRequest never declared them and is deny_unknown_fields, so every
-- wizard submission was rejected with 422 and no tenant could be created
-- through the UI at all. These columns give the collected intent a home.
--
-- CrowdRelay's tenant_settings stays authoritative for the RUNTIME behaviour
-- (the brain reads signal_enabled and north_star_metric from there). These
-- columns record what the operator asked for at creation time, so the values
-- survive before the tenant runtime exists to be configured, and so a
-- re-provision can replay the original intent.
ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS signal_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS north_star_metric text NOT NULL DEFAULT 'signal_installs';

ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS fanbase_sources text[] NOT NULL DEFAULT '{}';

-- Mirrors crowdrelay_domain::growth_metrics::NorthStarMetric. A value the
-- brain cannot parse would silently fall back to signal_installs there, so
-- reject it at the boundary instead of storing an unreadable intent.
ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_tenant_north_star_ck;
ALTER TABLE control_plane_tenants
    ADD CONSTRAINT control_plane_tenant_north_star_ck CHECK (
        north_star_metric IN (
            'signal_installs',
            'youtube_subscribers',
            'spotify_followers',
            'bandsintown_trackers'
        )
    );

-- A Signal-disabled tenant may not carry signal_installs as its north star.
-- Without this the brain selects the SignalConversion strategy and dispatches
-- signal-inviter into beacon routes that return 404, because signal_enabled
-- and north_star_metric are otherwise independent settings that nothing
-- reconciles.
ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_tenant_signal_north_star_ck;
ALTER TABLE control_plane_tenants
    ADD CONSTRAINT control_plane_tenant_signal_north_star_ck CHECK (
        signal_enabled OR north_star_metric <> 'signal_installs'
    );

COMMENT ON COLUMN control_plane_tenants.signal_enabled IS
    'Signal mobile app opt-in recorded at onboarding. Forwarded to the tenant runtime tenant_settings.signal_enabled, which is authoritative for runtime gating.';
COMMENT ON COLUMN control_plane_tenants.north_star_metric IS
    'Brain growth goal recorded at onboarding. Forwarded to tenant_settings.north_star_metric. Constrained to NorthStarMetric and never signal_installs while Signal is disabled.';
COMMENT ON COLUMN control_plane_tenants.fanbase_sources IS
    'Discovery platforms the operator selected at onboarding. Advisory: the discovery workers are configured per tenant runtime.';
