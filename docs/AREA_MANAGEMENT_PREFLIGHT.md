# AREA management preflight

The Control Plane does not expose AREA management credentials to the browser. It reaches each tenant's CrowdRelay instance through a private HTTP management origin and authenticates with a tenant-derived token.

## VIRYA (existing, non-provisioner-managed tenant)

VIRYA is the one special case: its runtime is not created by the tenant provisioner, so the private AREA channel must be wired explicitly on both sides.

Control Plane runtime requires:

- `CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY` — the shared 32+ character master key used only to derive per-tenant AREA tokens.
- `CONTROL_PLANE_VIRYA_MANAGEMENT_URL` — a bare loopback/private HTTP origin that reaches the CrowdRelay AREA management proxy, for example `http://127.0.0.1:18080` when both services share the host, or a private tunnel address when they do not.

CrowdRelay runtime requires:

- `CROWDRELAY_AREA_MANAGEMENT_ENABLED=true` so `compose.area-management.yaml` is included.
- `CROWDRELAY_AREA_MANAGEMENT_BIND_IP=<private-or-loopback-address>`.
- `CROWDRELAY_CONTROL_PLANE_AREA_API_KEY=<derived-token>`.

The CrowdRelay API key is **not** the master key. Derive it from the Control Plane tenant UUID:

```bash
python3 - "$CONTROL_PLANE_AREA_MANAGEMENT_MASTER_KEY" "$VIRYA_CONTROL_PLANE_TENANT_ID" <<'PY'
import hashlib
import hmac
import sys

master_key, tenant_id = sys.argv[1:3]
message = f"crowdrelay-area-admin-v1:{tenant_id}".encode("utf-8")
print(hmac.new(master_key.encode("utf-8"), message, hashlib.sha256).hexdigest())
PY
```

Do not paste the derived token into logs, tickets or browser tooling.

## Runtime smoke

From the Control Plane host, first prove network reachability without credentials:

```bash
curl --silent --show-error --connect-timeout 2 --max-time 5 \
  -o /dev/null -w '%{http_code}\n' \
  "$CONTROL_PLANE_VIRYA_MANAGEMENT_URL/v1/control-plane/area"
```

A `401` response proves the private listener is reachable and the privileged namespace is protected. Connection refusal/timeout means the transport is not wired yet.

Then use the Control Plane UI or its authenticated `/api/v1/tenants/virya/area` endpoint. A successful response proves all of: private target, tenant token derivation, CrowdRelay token configuration, database access and AREA repository wiring.

Provisioner-managed tenants do not need the manual derivation above. `deploy/provisioner.py` derives their `CROWDRELAY_CONTROL_PLANE_AREA_API_KEY` from the same master key and tenant UUID during provisioning.
