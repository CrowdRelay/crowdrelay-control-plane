# Bug tracker

Production issues, root causes, and fixes.

## 2026-09-18 — Tenant provisioning never completed end-to-end

**Symptom:** the first real tenants (`demo-roster`, `demo-label`) could not be
provisioned by the pipeline — jobs burned to `lease_exhausted`, generated
compose files failed to parse, tenant Postgres crash-looped, DNS A records
pointed at `127.0.1.1`, and edge routes 503'd permanently.

**Root causes (five independent defects, all latent since the provisioner
shipped — no tenant had ever completed):**

1. Claim response contract mismatch — the API returned the claim object at
   the top level while `deploy/provisioner.py` read `response["claim"]`.
   Every claim was silently discarded.
2. `render_compose` emitted a healthcheck string containing bare `"` inside
   a YAML double-quoted scalar — invalid YAML at first real render.
3. The compose template passed the PG18 `io_workers` name to the PG19beta3
   image (split into `io_min_workers`/`io_max_workers`).
4. DNS automation derived the host IP via
   `socket.gethostbyname(socket.gethostname())` — resolves to the private
   NAT VNIC address on the production host; A records were published
   pointing nowhere reachable.
5. `add-tenant-edge-route.sh` wrote `127.0.0.1:<port>` upstreams, but
   `virya-edge-caddy` runs on the `crowdrelay-shared` bridge network — host
   loopback is unreachable from inside the container.

**Fix:** server wraps the claim as `{"claim": …}` (agent accepts both shapes
during transition); compose emits JSON-quoted scalars and PG19 worker params;
`CONTROL_PLANE_PUBLIC_IP` is explicit and detection fails closed on
non-global addresses; the edge script takes an upstream argument and joins
tenant APIs to `crowdrelay-shared` under a `<slug>-api` alias; compose
attaches api+worker to that network when `CONTROL_PLANE_EDGE_NETWORK` is set.

**Also fixed:** demo tenants were born without
`CROWDRELAY_CONTROL_PLANE_API_KEY`/`_AREA_API_KEY` because provisioner.env
lacked the master keys — entire `/v1/control-plane/` surface answered 401.
Master keys added; both tenants' envs now carry derived keys.

**Regression coverage:** `scripts/test_provisioner.py` (dual-shape claim,
YAML render-parse, DNS fail-closed, edge-network attach).

## 2026-09-18 — Proxied mutations surfaced 503 on upstream 204

**Symptom:** any control-plane operation whose tenant endpoint legitimately
answers `204 No Content` — connection deletes, scan-scope updates, QR
campaign revokes, manual-post registrations, confirmations — returned
`503` to the operator UI even though the tenant had applied the mutation.

**Root cause:** `tenant_area_client::call` decodes an upstream 204 as
`Value::Null`; `object_no_store`/`array_no_store` then rejected `Null` as an
invalid JSON shape. Affected every mutation handler (~48 sites) — reads were
fine because their upstreams return bodies.

**Fix:** `mutation_no_store` maps `Null → 204`, object/array → `200 +
private, no-store`, anything else → contract error. The generic area proxy
applies the same rule to every non-GET method instead of `DELETE` alone.
The browser client already handled 204 (`api.ts` returns `undefined`).
