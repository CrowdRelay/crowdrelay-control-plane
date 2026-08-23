# CrowdRelay Control Plane

**Rust / Axum / SQLx / PostgreSQL + SolidJS operations plane for tenant provisioning, runtime health, branding, deployment identity and audit.**

The Control Plane answers what tenants exist, what is actually running, and at which exact revision. Provisioning intent is durable and transactional; a separately authenticated host agent performs the local runtime mutation under crash-recoverable leases. It is not required for CrowdRelay or Signal request handling.

## Features

- tenant registry and atomic **Create & deploy** provisioning intent;
- leased, crash-recoverable provisioning jobs;
- server-side runtime freshness: `healthy`, `degraded`, `stale` or `unknown`;
- per-tenant branding with inherited product defaults;
- exact deployment identity and meaningful audit events;
- tenant AREA/operations forwarding through server-only management keys and path allowlists;
- separate admin, telemetry, provisioner and tenant-management authorities;
- fail-closed recovery and rollback-aware deployment.

## Tech stack

Rust + Axum 0.8 + SQLx/PostgreSQL for the API and durable control state. SolidJS with TanStack Solid Router, TanStack Solid Query and Vite for the browser UI. One production binary serves the API and built SPA.

`deploy/provisioner.py` is the separately authenticated host agent. It claims approved jobs, validates the fixed plan schema, renders an isolated Docker Compose stack, keeps generated secrets host-local and reports terminal result plus runtime health through machine APIs.

## Boundary

CrowdRelay and Virya Signal are tenant products; band operations stay in the band-facing product. Synesthesia is not tenantized. Tenant traffic does not depend on Control Plane health.

## License

See [`LICENSE`](LICENSE).
