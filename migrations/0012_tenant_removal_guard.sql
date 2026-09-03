-- Deleting a tenant, and never being able to delete Virya.
--
-- Removing a tenant is the only destructive operation the control plane
-- offers, so the protection for the one tenant that must survive lives in the
-- database rather than in a handler. A check in Rust guards the routes that
-- exist today; this guards every path, including a future route, a migration
-- and a `psql` session opened at 2am.
--
-- The slug is hardcoded for the same reason `control_plane_synesthesia_virya_only_ck`
-- in 0001 hardcodes it: Virya is not "a tenant that happens to be flagged", it
-- is the tenant this platform exists to run. A `protected boolean` column would
-- be a switch someone can flip, which is precisely what must not exist here.
--
-- ERRCODE is `restrict_violation` so the API layer can tell this apart from an
-- ordinary constraint failure and report it as a refusal rather than an error.

CREATE OR REPLACE FUNCTION control_plane_protect_primary_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.slug = 'virya' THEN
        RAISE EXCEPTION 'the virya tenant cannot be removed'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS control_plane_tenants_protect_primary ON control_plane_tenants;

CREATE TRIGGER control_plane_tenants_protect_primary
BEFORE DELETE ON control_plane_tenants
FOR EACH ROW
EXECUTE FUNCTION control_plane_protect_primary_tenant();
