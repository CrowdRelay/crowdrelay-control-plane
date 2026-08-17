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

Deployment pipelines or a future narrow deployment agent can report runtime status using:

`PUT /api/v1/tenants/:slug/runtime`

The payload supports API/worker health, schema version, deployment SHA, outbox pending count, queue lag and heartbeat time. This moves infrastructure status out of Virya Staff without making the Control Plane a dependency of tenant traffic.

## Provisioning

Version 1 creates an audited **plan**, not an imperative remote execution request. A later worker/agent should consume only approved provisioning jobs with a narrow capability set. Do not add arbitrary shell/SSH command execution to the HTTP API.
