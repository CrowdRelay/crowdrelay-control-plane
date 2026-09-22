-- `approvals.pending` was emitted from `report_runtime` but never added to
-- the outbox event allowlist. Every insert violated the CHECK constraint,
-- and because the enqueue runs inside the heartbeat transaction the whole
-- heartbeat failed — a tenant whose approval queue grew could not report
-- runtime at all. The notification pipeline ended one step short of the
-- table it was built to write.
ALTER TABLE control_plane_notification_outbox
    DROP CONSTRAINT control_plane_notification_outbox_event_check;
ALTER TABLE control_plane_notification_outbox
    ADD CONSTRAINT control_plane_notification_outbox_event_check
    CHECK (event IN (
        'provisioning.failed', 'runtime.degraded', 'runtime.stale',
        'runtime.recovered', 'approvals.pending', 'test'
    ));
