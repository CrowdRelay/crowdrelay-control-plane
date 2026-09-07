-- Extend the park snapshot to store the full envelope values and posture
-- version, so resume restores the exact operating state rather than
-- resetting budgets/cooldown/blast-radius to defaults.

ALTER TABLE control_plane_tenant_park_snapshot
    ADD COLUMN IF NOT EXISTS weekly_owned_audience_touches integer NOT NULL DEFAULT 200,
    ADD COLUMN IF NOT EXISTS weekly_third_party_touches integer NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS subject_cooldown_hours integer NOT NULL DEFAULT 168,
    ADD COLUMN IF NOT EXISTS max_recipients_per_step integer NOT NULL DEFAULT 250,
    ADD COLUMN IF NOT EXISTS posture_version bigint NOT NULL DEFAULT 1;
