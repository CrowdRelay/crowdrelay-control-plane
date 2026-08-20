# CrowdRelay Control Plane

Platform-superadmin dashboard for tenant provisioning, health, branding, deployment metadata and audit. It is deliberately separate from Virya Staff: band operations stay in the band-facing product, while infrastructure and tenant lifecycle live here.

## Product boundary

- CrowdRelay and Virya Signal are tenant products.
- Virya is seeded as the platform-owner tenant.
- Virya branding defaults to **inherit product defaults**; this preserves the existing CrowdRelay/Signal palette byte-for-byte until a custom palette is explicitly saved.
- Synesthesia is not tenantized. The database enforces `synesthesia_enabled => slug = 'virya'`.
- The Control Plane is not required for CrowdRelay/Signal request handling and is not a runtime dependency of tenant traffic.

## Stack

- Rust + Axum 0.8 + SQLx/PostgreSQL
- SolidJS + TanStack Solid Router + TanStack Solid Query + Vite
- One production binary serves `/api/v1/*` and the built SPA

Axum 0.8's typed `State` model is used for global application state, while the admin authorization boundary is request middleware. TanStack Solid Query provides the server-state cache/refetch layer; TanStack Solid Router provides typed client routing.

## Local run

```bash
cp .env.example .env
# set CONTROL_PLANE_ADMIN_TOKEN and CONTROL_PLANE_TELEMETRY_TOKEN to different random 32+ character secrets

docker compose up -d postgres
export DATABASE_URL=postgres://control_plane:control-plane-local@127.0.0.1:5433/control_plane
export CONTROL_PLANE_ADMIN_TOKEN='replace-with-a-long-random-token'
export CONTROL_PLANE_TELEMETRY_TOKEN='replace-with-a-different-long-random-token'

cd frontend
npm ci
npm run dev

# separate shell
cargo run -p crowdrelay-control-plane-api
```

Vite proxies `/api` and `/healthz` to `127.0.0.1:8090`. In local development the Vite **server-side proxy** injects `CONTROL_PLANE_ADMIN_TOKEN` as upstream Bearer auth; the token is never compiled into the browser bundle.

## First tenant: Virya

On API startup, the registry creates or reconciles a `virya` row. It uses `branding_palette = NULL`, meaning **inherit existing CrowdRelay/Signal defaults**. Set `CONTROL_PLANE_VIRYA_WORKSPACE_ID` when the actual CrowdRelay workspace UUID is available.

## Tenant provisioning v2

The Tenants screen can create a registry entry alone or use **Create & deploy**. The deployment variant is atomic at the database boundary: the tenant row and its `approved` provisioning job are written in one transaction. If the deployment intent cannot be validated/queued, no half-created tenant is committed.

The HTTP API still never receives Docker access. `deploy/provisioner.py` is a separately authenticated host agent that claims approved jobs with a lease, validates a fixed plan schema, renders a fixed tenant-isolated Docker Compose stack, and reports success/failure back through `/api/v1/provisioner/*`. It creates one Postgres volume plus setup/API/worker services per tenant, binds the API only to `127.0.0.1:<allocated-port>`, keeps generated secrets host-local, and refreshes non-secret tenant runtime config independently on upgrades.

At most one `planned`/`approved`/`running` job may exist per tenant. Claims are leased and crash-recoverable; identical completion retries are idempotent, while contradictory terminal results fail closed. The agent also observes deployments it owns and reports API/worker health through the existing telemetry endpoint, so a dead agent naturally turns runtime state stale instead of leaving a tenant green forever.

The provisioner only creates the local CrowdRelay instance. Public DNS/edge routing remains a separate infrastructure step: after success the UI shows the provisioner worker and allocated localhost port that `crowdrelayBaseUrl` must route to.

To enable the agent, configure three distinct secrets (`ADMIN`, `TELEMETRY`, `PROVISIONER`), install `deploy/provisioner.env.example` as `/etc/crowdrelay-control-plane/provisioner.env`, install the example systemd unit, and enable it. `CONTROL_PLANE_PROVISIONER_DEFAULT_IMAGE_TAG` should point at an immutable `sha-<40-char CrowdRelay commit>` image tag.

## API

Operator routes require `Authorization: Bearer <CONTROL_PLANE_ADMIN_TOKEN>`. Direct API clients may send that header themselves. The production browser SPA sends **no application token at all**: the browser authenticates to Caddy with Basic Auth, then Caddy replaces the verified Basic header with the server-held admin Bearer token only on the localhost upstream hop. This avoids the single-`Authorization` header collision that causes Basic challenge loops and keeps the platform-admin secret out of browser storage and JavaScript. See `deploy/Caddyfile.control.virya.music.example`.

`PUT /api/v1/tenants/:slug/runtime` is a separate machine boundary and accepts only `Authorization: Bearer <CONTROL_PLANE_TELEMETRY_TOKEN>`. The admin token cannot report telemetry and the telemetry token cannot mutate tenants. Both configured/supplied secrets are SHA-256 hashed and compared in constant time.

Tenant AREA and operations calls use separate server-only master keys. The browser never receives either credential. For Virya both channels share the private `CONTROL_PLANE_VIRYA_MANAGEMENT_URL`; if either management master key is configured, that URL is mandatory and there is no application fallback. The server derives a tenant-scoped token before forwarding only the explicitly allowlisted AREA/operations paths.

Key routes:

```text
GET    /api/v1/overview
GET    /api/v1/tenants
POST   /api/v1/tenants
GET    /api/v1/tenants/:slug
PATCH  /api/v1/tenants/:slug/branding
POST   /api/v1/tenants/:slug/suspend
POST   /api/v1/tenants/:slug/resume
POST   /api/v1/tenants/:slug/provisioning/plan
POST   /api/v1/tenants/:slug/provisioning/deploy
GET    /api/v1/tenants/:slug/provisioning
POST   /api/v1/tenants/:slug/provisioning/cancel
GET    /api/v1/tenants/:slug/audit
PUT    /api/v1/tenants/:slug/runtime

GET    /api/v1/tenants/:slug/area
PATCH  /api/v1/tenants/:slug/area/settings
GET    /api/v1/tenants/:slug/area/cities
POST   /api/v1/tenants/:slug/area/cities
GET    /api/v1/tenants/:slug/area/drops
POST   /api/v1/tenants/:slug/area/drops
GET    /api/v1/tenants/:slug/area/drops/:drop_id
DELETE /api/v1/tenants/:slug/area/drops/:drop_id
PATCH  /api/v1/tenants/:slug/area/drops/:drop_id/draft
DELETE /api/v1/tenants/:slug/area/drops/:drop_id/draft
POST   /api/v1/tenants/:slug/area/drops/:drop_id/validate
POST   /api/v1/tenants/:slug/area/drops/:drop_id/publish
POST   /api/v1/tenants/:slug/area/drops/:drop_id/pause
POST   /api/v1/tenants/:slug/area/drops/:drop_id/resume
POST   /api/v1/tenants/:slug/area/drops/:drop_id/archive
POST   /api/v1/tenants/:slug/area/drops/:drop_id/duplicate

GET    /api/v1/tenants/:slug/operations/summary
GET    /api/v1/tenants/:slug/operations/flags
POST   /api/v1/tenants/:slug/operations/flags/:key
GET    /api/v1/tenants/:slug/operations/autopilot
POST   /api/v1/tenants/:slug/operations/autopilot/:context

POST   /api/v1/provisioner/jobs/claim
POST   /api/v1/provisioner/jobs/:id/lease
POST   /api/v1/provisioner/jobs/:id/succeed
POST   /api/v1/provisioner/jobs/:id/fail
```

## Production deployment

The canonical Home deployment is one command from a clean local `main` that exactly matches `origin/main`:

```bash
make deploy-production
```

The deploy builds an immutable `linux/amd64` image carrying the exact Git revision, transfers it together with the source-controlled Virya tunnel overlay/Caddyfile, validates management wiring before mutation, recreates the app+tunnel as one release unit, verifies the current network namespace/mount/runtime revision, and finishes with a real Virya operations-summary E2E. Failures after mutation restore the previous application image while keeping repaired canonical management infrastructure instead of resurrecting stale tunnel files.

## Quality gates

```bash
make static
make ci
```

GitHub Actions is the release-validation source of truth. It runs the committed static/Python contracts, PostgreSQL migration smoke, Rust formatting/lint/tests and frontend tests/build/budget. Do not maintain hand-written PASS snapshots or source-tree checksum manifests as substitutes for those executable gates.

Web production budget is intentionally small: 260 KiB raw JS and 80 KiB raw CSS. The committed lockfile is used with `npm ci` in CI/Docker for deterministic installs.

## Runtime freshness

Runtime health is classified server-side as `healthy`, `degraded`, `stale`, or `unknown`. `CONTROL_PLANE_RUNTIME_STALE_AFTER_SECONDS` defaults to 180 seconds; a once-healthy tenant therefore cannot remain green forever after its reporter dies. Heartbeat-only refreshes update the current status row without appending an audit row; audit is reserved for first observation or meaningful health/schema/deployment changes.

## Caddy / Basic Auth

The browser must use **Basic Auth only** at `control.virya.music`. A fetch that sets `Authorization: Bearer ...` replaces the browser's cached `Basic` header and triggers another `401 WWW-Authenticate` challenge. The checked-in Caddy example evaluates Basic at the edge and then injects `Bearer {$CONTROL_PLANE_ADMIN_TOKEN}` server-side only inside `reverse_proxy`. Runtime telemetry and `/api/v1/provisioner/*` are machine routes that bypass browser Basic; each has its own backend Bearer secret. The admin token is never stored in `sessionStorage`, local storage, HTML, or the SPA bundle.
