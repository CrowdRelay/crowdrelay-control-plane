-- The audit log is only ever read per tenant (`WHERE tenant_id = $1 ORDER BY
-- created_at DESC`), served by the (tenant_id, created_at) index. The global
-- created_at index from 0001 supports no query in this codebase and only
-- amplified every audit insert. Drop it; migrations are append-only.
DROP INDEX IF EXISTS control_plane_audit_created_idx;
