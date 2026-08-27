-- Automation events: n8n pushes workflow execution outcomes (errors,
-- status, heartbeat) here instead of spamming Discord. The control plane
-- stores them, surfaces them in the operator UI, and routes only "real
-- work" events to Discord based on per-workflow config.
CREATE TABLE control_plane_automation_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     text NOT NULL,
    workflow_name   text NOT NULL,
    execution_id    text,
    event_kind      text NOT NULL CHECK(event_kind IN ('error','status','heartbeat','approval')),
    severity        text NOT NULL CHECK(severity IN ('info','warn','error')),
    node_name       text,
    message         text NOT NULL,
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    status          text NOT NULL DEFAULT 'new' CHECK(status IN ('new','acknowledged','retried','resolved','muted')),
    retry_count     integer NOT NULL DEFAULT 0,
    last_retried_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Hot read path: recent events by status, filtered by workflow.
CREATE INDEX automation_events_status_idx
    ON control_plane_automation_events(status, occurred_at DESC);
CREATE INDEX automation_events_workflow_idx
    ON control_plane_automation_events(workflow_id, occurred_at DESC);
-- Retention sweep: delete resolved events older than 30 days.
CREATE INDEX automation_events_retention_idx
    ON control_plane_automation_events(status, occurred_at)
    WHERE status IN ('resolved','retried','muted');

-- Per-workflow routing config. Seeded lazily: the first event for a
-- workflow creates a default row (category='status', discord_enabled=false).
-- Operators flip real-work workflows to category='real_work' + discord_enabled=true.
CREATE TABLE control_plane_automation_workflow_config (
    workflow_id     text PRIMARY KEY,
    label           text NOT NULL,
    category        text NOT NULL DEFAULT 'status' CHECK(category IN ('real_work','status','system')),
    discord_enabled boolean NOT NULL DEFAULT false,
    muted           boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
