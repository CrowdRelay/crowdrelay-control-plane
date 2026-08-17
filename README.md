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

## Tenant provisioning v1

`POST /api/v1/tenants/:slug/provisioning/plan` creates a durable, audited provisioning plan. At most one `planned`/`approved`/`running` plan may exist per tenant; concurrent duplicate clicks return the existing active plan. It intentionally does **not** run SSH/Docker commands from a web request. A future deployment agent/worker can consume approved jobs through a narrow capability boundary.

This keeps the Control Plane from becoming an RCE surface or a single point of failure.

## API

Operator routes require `Authorization: Bearer <CONTROL_PLANE_ADMIN_TOKEN>`. Direct API clients may send that header themselves. The production browser SPA sends **no application token at all**: the browser authenticates to Caddy with Basic Auth, then Caddy replaces the verified Basic header with the server-held admin Bearer token only on the localhost upstream hop. This avoids the single-`Authorization` header collision that causes Basic challenge loops and keeps the platform-admin secret out of browser storage and JavaScript. See `deploy/Caddyfile.control.virya.music.example`.

`PUT /api/v1/tenants/:slug/runtime` is a separate machine boundary and accepts only `Authorization: Bearer <CONTROL_PLANE_TELEMETRY_TOKEN>`. The admin token cannot report telemetry and the telemetry token cannot mutate tenants. Both configured/supplied secrets are SHA-256 hashed and compared in constant time.

Key routes:

```text
GET   /api/v1/overview
GET   /api/v1/tenants
POST  /api/v1/tenants
GET   /api/v1/tenants/:slug
PATCH /api/v1/tenants/:slug/branding
POST  /api/v1/tenants/:slug/suspend
POST  /api/v1/tenants/:slug/resume
POST  /api/v1/tenants/:slug/provisioning/plan
GET   /api/v1/tenants/:slug/audit
PUT   /api/v1/tenants/:slug/runtime
```

## Quality gates

```bash
make static
make ci
```

Web production budget is intentionally small: 260 KiB raw JS and 80 KiB raw CSS. The committed lockfile is used with `npm ci` in CI/Docker for deterministic installs.

## Runtime freshness

Runtime health is classified server-side as `healthy`, `degraded`, `stale`, or `unknown`. `CONTROL_PLANE_RUNTIME_STALE_AFTER_SECONDS` defaults to 180 seconds; a once-healthy tenant therefore cannot remain green forever after its reporter dies. Heartbeat-only refreshes update the current status row without appending an audit row; audit is reserved for first observation or meaningful health/schema/deployment changes.

## Caddy / Basic Auth

The browser must use **Basic Auth only** at `control.virya.music`. A fetch that sets `Authorization: Bearer ...` replaces the browser's cached `Basic` header and triggers another `401 WWW-Authenticate` challenge. The checked-in Caddy example evaluates Basic at the edge and then injects `Bearer {$CONTROL_PLANE_ADMIN_TOKEN}` server-side only inside `reverse_proxy`. Runtime telemetry is the sole `/api/v1/*` route that bypasses Basic; it has its own backend Bearer secret. The admin token is never stored in `sessionStorage`, local storage, HTML, or the SPA bundle.
