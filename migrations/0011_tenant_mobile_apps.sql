-- Per-tenant Google Play Store URLs for mobile apps.
--
-- Each tenant that opts into Signal and/or Synesthesia gets their own Play
-- Store listing with a unique package ID (music.{slug}.signal,
-- music.{slug}.synesthesia). These columns store the public Play Store URL
-- once the app is published. NULL means the app is not yet published or the
-- product is not enabled for this tenant.
ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS signal_play_store_url text NULL;

ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS synesthesia_play_store_url text NULL;

-- Remove the Virya-only constraint on synesthesia_enabled.
-- Synesthesia is now available to all tenants that opt in.
ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_synesthesia_virya_only_ck;

COMMENT ON COLUMN control_plane_tenants.signal_play_store_url IS
    'Google Play Store URL for this tenant''s Signal app (music.{slug}.signal). NULL until the app is published.';
COMMENT ON COLUMN control_plane_tenants.synesthesia_play_store_url IS
    'Google Play Store URL for this tenant''s Synesthesia app (music.{slug}.synesthesia). NULL until the app is published.';
