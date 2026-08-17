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
# set CONTROL_PLANE_ADMIN_TOKEN to a random 32+ character secret

docker compose up -d postgres
export DATABASE_URL=postgres://control_plane:control-plane-local@127.0.0.1:5433/control_plane
export CONTROL_PLANE_ADMIN_TOKEN='replace-with-a-long-random-token'

cd frontend
npm install
npm run dev

# separate shell
cargo run -p crowdrelay-control-plane-api
```

Vite proxies `/api` and `/healthz` to `127.0.0.1:8090`.

## First tenant: Virya

On API startup, the registry creates or reconciles a `virya` row. It uses `branding_palette = NULL`, meaning **inherit existing CrowdRelay/Signal defaults**. Set `CONTROL_PLANE_VIRYA_WORKSPACE_ID` when the actual CrowdRelay workspace UUID is available.

## Tenant provisioning v1

`POST /api/v1/tenants/:slug/provisioning/plan` creates a durable, audited provisioning plan. It intentionally does **not** run SSH/Docker commands from a web request. A future deployment agent/worker can consume approved jobs through a narrow capability boundary.

This keeps the Control Plane from becoming an RCE surface or a single point of failure.

## API

All `/api/v1/*` routes require:

```text
Authorization: Bearer <CONTROL_PLANE_ADMIN_TOKEN>
```

The server hashes the configured and supplied token with SHA-256 and compares hashes in constant time.

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

Web production budget is intentionally small: 260 KiB raw JS and 80 KiB raw CSS. Once the first lockfile is generated in a networked environment, commit it and switch CI/Docker from `npm install` to `npm ci`.
