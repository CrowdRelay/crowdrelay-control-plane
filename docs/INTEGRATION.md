# CrowdRelay / Signal integration contract

The Control Plane is intentionally **not** on the request path of CrowdRelay or Signal.

## Tenant identity

The canonical Control Plane tenant fields are:

- `slug` — stable human-readable tenant identifier
- `workspaceId` — optional mapping to CrowdRelay's existing workspace isolation
- CrowdRelay base URL
- Signal base URL
- status (`provisioning`, `active`, `suspended`)

CrowdRelay remains responsible for enforcing workspace isolation in its own database. The Control Plane only manages the mapping and platform lifecycle.

## Branding

`brandingPalette = null` means **inherit the application's built-in current defaults**. This is the Virya default and requires no extra lookup in tenant request hot paths.

A custom palette contains only semantic tokens:

- primary / primaryContrast
- accent
- surface / surfaceElevated
- text / textMuted
- success / warning / danger

The Control Plane validates `#RRGGBB` format and WCAG AA contrast for primary text and main surface text before accepting a palette.

CrowdRelay and Signal may consume this configuration during deployment/startup or via their existing metadata/config cache. They should not synchronously call the Control Plane per user request.

## Synesthesia

Synesthesia is a Virya-owned product and is not tenantized.

The database constraint makes `synesthesiaEnabled=true` invalid for every tenant except `virya`. The tenant creation API does not expose a Synesthesia entitlement field at all.

## Runtime health

Deployment pipelines and the narrow tenant provisioner report runtime status using:

`PUT /api/v1/tenants/:slug/runtime`

This endpoint uses a dedicated `CONTROL_PLANE_TELEMETRY_TOKEN`, not the operator/admin credential. The payload supports API/worker health, schema version, deployment SHA, outbox pending count, queue lag and heartbeat time. The backend classifies each tenant as `healthy`, `degraded`, `stale`, or `unknown` using the server-side freshness threshold. A heartbeat refresh alone is state, not an operator audit event; only first observation and meaningful health/schema/SHA changes are appended to the audit log. This moves infrastructure status out of Virya Staff without making the Control Plane a dependency of tenant traffic.

## Provisioning

The Control Plane supports both plan-only and executable tenant provisioning without giving the HTTP API Docker/SSH capability. `POST /api/v1/tenants` accepts optional `deployCrowdrelay=true` plus `desiredVersion`; when enabled, tenant creation and the approved deployment job are committed atomically. Existing tenants can use `/provisioning/deploy` for initial deployment, retry, or upgrade.

A separately authenticated host agent (`deploy/provisioner.py`) claims approved jobs through `/api/v1/provisioner/*`. The plan is data, not shell: the agent accepts only the fixed `local_docker_compose` schema, immutable `sha-<40 hex>` CrowdRelay image tags, safe tenant identities and bare HTTPS origins. It allocates a host-local port under an inter-process file lock, persists write-once secrets separately from refreshable tenant config, runs migrations/bootstrap, starts API+worker, waits for readiness, probes the workspace/schema, and reports the exact result.

Provisioning completion/failure callbacks are terminal-idempotent. Retryable Control Plane transport errors do not incorrectly mark a healthy deployment failed; the lease expires and the job can be reclaimed safely. The resulting CrowdRelay API is bound to localhost only. DNS and edge routing are intentionally outside this capability boundary and must route the tenant's configured CrowdRelay origin to the reported host/port.
