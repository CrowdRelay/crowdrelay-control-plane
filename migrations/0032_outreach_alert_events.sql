-- Outreach conditions a person should hear about without opening the console.
--
-- The tenant heartbeat now carries three outreach gauges: whether unattended
-- Reddit posting is halted by the account's standing, how many drafted
-- replies to commenters have waited on a person for over 12 hours, and how
-- many lanes produced no fan in 60 days. The Control Plane keeps the last
-- reported value of each here and raises a notifier event on a rise — the
-- same edge rule as `approvals.pending`, so a flat condition does not re-fire
-- every 60 seconds and train the channel to be ignored.
--
-- Nullable: a CrowdRelay that predates the gauges reports nothing, and
-- nothing is a different fact from zero.
CREATE TABLE IF NOT EXISTS control_plane_outreach_alert_state (
    tenant_id uuid PRIMARY KEY REFERENCES control_plane_tenants(id) ON DELETE CASCADE,
    reddit_halted boolean,
    replies_waiting bigint CHECK (replies_waiting IS NULL OR replies_waiting >= 0),
    cut_candidate_lanes bigint CHECK (cut_candidate_lanes IS NULL OR cut_candidate_lanes >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE control_plane_notification_outbox
    DROP CONSTRAINT control_plane_notification_outbox_event_check;
ALTER TABLE control_plane_notification_outbox
    ADD CONSTRAINT control_plane_notification_outbox_event_check
    CHECK (event IN (
        'provisioning.failed', 'runtime.degraded', 'runtime.stale',
        'runtime.recovered', 'approvals.pending', 'outreach.reddit_halted',
        'outreach.replies_waiting', 'outreach.lanes_cut', 'test'
    ));
