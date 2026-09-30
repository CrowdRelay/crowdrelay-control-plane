-- n8n delivers execution outcomes at-least-once; the same push retried
-- created a second event row and a second Discord forward. The execution's
-- identity is (tenant, execution_id) plus its kind — one execution can
-- legitimately emit distinct kinds (a heartbeat and an error), so kind is
-- part of the key. NULL execution_id rows never conflict: an outcome we
-- cannot identify is always stored.
CREATE UNIQUE INDEX IF NOT EXISTS control_plane_automation_events_execution_uq
    ON control_plane_automation_events (tenant_id, execution_id, event_kind)
    WHERE execution_id IS NOT NULL;
