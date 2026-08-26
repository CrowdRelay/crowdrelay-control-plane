-- Platform infrastructure health: n8n, edge, and other shared services
-- that are not per-tenant. The control plane polls these on a fixed
-- cadence and stores the latest probe result so the operator UI can
-- surface degradation without a live fetch on every page load.
CREATE TABLE control_plane_platform_health (
    service         text PRIMARY KEY,
    label           text NOT NULL,
    url             text NOT NULL,
    healthy         boolean NOT NULL DEFAULT false,
    last_status     text,
    last_checked_at timestamptz NOT NULL DEFAULT now(),
    last_healthy_at timestamptz,
    latency_ms      integer
);

INSERT INTO control_plane_platform_health (service, label, url, healthy)
VALUES ('n8n', 'n8n automation', 'https://n8n.virya.music/healthz', false)
ON CONFLICT (service) DO NOTHING;
