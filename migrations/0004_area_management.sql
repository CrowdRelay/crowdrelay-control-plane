-- Tenant AREA entitlement. AREA runtime/config remains canonical in tenant CrowdRelay.
ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS area_enabled boolean NOT NULL DEFAULT false;

-- VIRYA already operates AREA and remains enabled across the additive migration.
UPDATE control_plane_tenants SET area_enabled = true WHERE slug = 'virya';
