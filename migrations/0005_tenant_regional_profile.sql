-- Explicit tenant regionalization profile.
--
-- Existing tenants are intentionally NOT backfilled. NULL means
-- legacy/unclassified and is visible to the operator. New tenants must persist
-- an explicit profile before a schema-v4 deployment can be created.
ALTER TABLE control_plane_tenants
    ADD COLUMN IF NOT EXISTS regional_profile jsonb;

-- Remove the old hidden PL default. Existing rows retain their stored value;
-- Virya is inserted explicitly as PL by current application code.
ALTER TABLE control_plane_tenants
    ALTER COLUMN default_country_code DROP DEFAULT;

ALTER TABLE control_plane_tenants
    DROP CONSTRAINT IF EXISTS control_plane_tenants_regional_profile_shape;
ALTER TABLE control_plane_tenants
    ADD CONSTRAINT control_plane_tenants_regional_profile_shape CHECK (
        regional_profile IS NULL OR (
            jsonb_typeof(regional_profile) = 'object'
            AND jsonb_object_length(regional_profile) = 8
            AND regional_profile ?& ARRAY[
                'countryCode','region','locale','timezone','currency',
                'dateFormat','numberFormat','dataRegion'
            ]
            AND regional_profile->>'countryCode' ~ '^[A-Z]{2}$'
            AND regional_profile->>'currency' ~ '^[A-Z]{3}$'
            AND regional_profile->>'region' IN ('eu','us')
            AND regional_profile->>'dataRegion' IN ('eu','us')
            AND regional_profile->>'dateFormat' IN ('dmy','mdy','ymd')
            AND regional_profile->>'numberFormat' IN ('comma_decimal','dot_decimal')
            AND default_country_code = regional_profile->>'countryCode'
        )
    );

COMMENT ON COLUMN control_plane_tenants.regional_profile IS
    'Explicit persisted market/locale/timezone/currency/residency profile. NULL means legacy/unclassified; never infer residency from browser/IP.';
