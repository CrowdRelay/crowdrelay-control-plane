-- Additive indexes for hot query paths identified in the DB audit.
-- All are CREATE INDEX IF NOT EXISTS so this migration is safe to re-run.

-- control_plane_notification_outbox: notifier_outbox joins on channel_id
-- and sorts by created_at DESC. The channel_id FK had no index.
CREATE INDEX IF NOT EXISTS control_plane_notification_outbox_channel_created_idx
  ON control_plane_notification_outbox (channel_id, created_at DESC);

-- control_plane_automation_events: list_automation_events orders by
-- occurred_at DESC with optional status/workflow_id filters. The unfiltered
-- case had no covering index.
CREATE INDEX IF NOT EXISTS control_plane_automation_events_occurred_idx
  ON control_plane_automation_events (occurred_at DESC);

-- control_plane_audit_log: recent_external_deploy filters by tenant_id,
-- action, target_kind, and created_at. The existing index only covered
-- (tenant_id, created_at).
CREATE INDEX IF NOT EXISTS control_plane_audit_tenant_action_target_idx
  ON control_plane_audit_log (tenant_id, action, target_kind, created_at DESC);

-- control_plane_operator_accounts: list_operator_accounts filters by
-- tenant_id and role, orders by created_at.
CREATE INDEX IF NOT EXISTS control_plane_operator_accounts_tenant_role_idx
  ON control_plane_operator_accounts (tenant_id, role, created_at);

-- control_plane_notifier_channels: list_notifier_channels filters by
-- tenant_id and orders by created_at. The existing unique index only
-- covered (tenant_id, label).
CREATE INDEX IF NOT EXISTS control_plane_notifier_channels_tenant_created_idx
  ON control_plane_notifier_channels (tenant_id, created_at);
