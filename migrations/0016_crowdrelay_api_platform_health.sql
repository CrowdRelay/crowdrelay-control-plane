-- Seed the CrowdRelay API into platform health so the control plane polls it
-- every 30s alongside n8n. The URL uses the internal Docker network alias
-- (crowdrelay-api-1:8080) when co-located on the same host, or the public
-- URL when on separate hosts. The control plane app joins crowdrelay-shared
-- in compose.production.yml, so the internal URL is the default.
--
-- The health check endpoint returns {"status":"ready"} with a 200, which
-- matches the poller's JSON status-field check.
INSERT INTO control_plane_platform_health (service, label, url, healthy)
VALUES (
    'crowdrelay-api',
    'CrowdRelay API',
    COALESCE(
        current_setting('app.crowdrelay_api_health_url', true),
        'http://crowdrelay-api-1:8080/v1/health/ready'
    ),
    false
) ON CONFLICT (service) DO UPDATE SET
    label = EXCLUDED.label,
    url = EXCLUDED.url;
