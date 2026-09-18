#!/usr/bin/env bash
# Publishes a provisioned tenant at its public hostname.
#
# The provisioner deliberately binds a tenant's API to 127.0.0.1:<port> and
# stops there — the control plane has no edge authority, and a provisioner that
# could rewrite the shared Caddyfile would be a provisioner that could take
# every other tenant offline. The console says as much on the tenant page:
# "Route <url> at the edge to this host port to expose it publicly."
#
# That sentence was the last manual step of onboarding, performed from memory.
# This is that step, written down: same site block every time, validated before
# it is loaded, and reverted if the reload fails.
#
#   sudo bash scripts/add-tenant-edge-route.sh api.band.example 18101
#   sudo bash scripts/add-tenant-edge-route.sh api.band.example 18101 demo-api:8080
#   sudo bash scripts/add-tenant-edge-route.sh api.band.example 18101 --dry-run
#
# The upstream is chosen from how the edge container is networked:
#   * host-networked edge          → 127.0.0.1:<port>
#   * bridge-networked edge        → <first-label>-api:8080 on the shared
#     Docker network (the provisioner attaches the tenant API under that
#     alias; this script ensures the attachment and verifies it from inside
#     the edge container before writing the route)
#   * an explicit third argument   → used verbatim (e.g. when the service is
#     named differently)
#
# Run the preflight first. It checks DNS, which has to be correct before Caddy
# can issue a certificate for the name.
set -Eeuo pipefail

HOSTNAME_ARG="${1:-}"
PORT_ARG="${2:-}"
UPSTREAM_ARG=""
DRY_RUN=0
for arg in "${3:-}" "${4:-}"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    "") ;;
    *) UPSTREAM_ARG="$arg" ;;
  esac
done

EDGE_CADDYFILE="${EDGE_CADDYFILE:-/opt/crowdrelay/ops/edge/Caddyfile}"
EDGE_CONTAINER="${EDGE_CONTAINER:-virya-edge-caddy}"
EDGE_NETWORK="${EDGE_NETWORK:-crowdrelay-shared}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -n "$HOSTNAME_ARG" && -n "$PORT_ARG" ]] \
  || die "usage: $0 <public-hostname> <tenant-api-port> [upstream] [--dry-run]"
[[ "$HOSTNAME_ARG" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] \
  || die "hostname must be a bare DNS name, got: $HOSTNAME_ARG"
[[ "$PORT_ARG" =~ ^[0-9]+$ ]] && (( PORT_ARG >= 1024 && PORT_ARG <= 65535 )) \
  || die "port must be 1024-65535, got: $PORT_ARG"
[[ "$(id -u)" -eq 0 ]] || die "run with sudo — the edge Caddyfile is root-owned"
[[ -w "$EDGE_CADDYFILE" ]] || die "cannot write $EDGE_CADDYFILE"

if grep -qE "^\s*${HOSTNAME_ARG//./\\.}\s*\{" "$EDGE_CADDYFILE"; then
  die "$HOSTNAME_ARG already has a site block — edit it by hand rather than appending a second one"
fi

# Reachability first. Caddy will keep retrying a certificate for a name that
# does not point here, and the tenant's URL stays broken while it does.
if command -v dig >/dev/null 2>&1; then
  resolved="$(dig +short "$HOSTNAME_ARG" A | tail -n1)"
  [[ -n "$resolved" ]] || die "$HOSTNAME_ARG has no A record — add DNS before routing it"
fi

# The tenant stack has to be answering before it is published, or the first
# visitor gets a 502 with a valid certificate on it.
if ! curl --fail --silent --show-error --max-time 5 \
     "http://127.0.0.1:${PORT_ARG}/v1/health/ready" >/dev/null; then
  die "nothing healthy on 127.0.0.1:${PORT_ARG} — check the provisioning job finished before publishing the hostname"
fi

# A 127.0.0.1 upstream only resolves to the host when the edge container is
# host-networked. On a bridge network it means the edge container itself —
# that misroute served 503s until it was found. Derive the upstream from the
# edge's real network mode instead of assuming.
EDGE_NETWORK_MODE="$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$EDGE_CONTAINER" 2>/dev/null || true)"
TENANT_LABEL="${HOSTNAME_ARG%%.*}"
if [[ -n "$UPSTREAM_ARG" ]]; then
  UPSTREAM="$UPSTREAM_ARG"
elif [[ -z "$EDGE_NETWORK_MODE" || "$EDGE_NETWORK_MODE" == "host" ]]; then
  UPSTREAM="127.0.0.1:${PORT_ARG}"
else
  UPSTREAM="${TENANT_LABEL}-api:8080"
fi

if [[ "$UPSTREAM" != 127.0.0.1:* && "$UPSTREAM" != localhost:* ]]; then
  # Attach the tenant API to the network the edge routes across, under the
  # alias the upstream names. Idempotent — a repeat attach is a no-op error.
  if [[ "$EDGE_NETWORK_MODE" != "host" && -n "$EDGE_NETWORK_MODE" ]]; then
    edge_networks="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$EDGE_CONTAINER" 2>/dev/null || true)"
    case " $edge_networks " in
      *" $EDGE_NETWORK "*) ;;
      *) EDGE_NETWORK="$(printf '%s' "$edge_networks" | awk '{print $1}')" ;;
    esac
    [[ -n "$EDGE_NETWORK" ]] || die "edge container $EDGE_CONTAINER is on no bridge network to attach to"
    docker network connect --alias "${UPSTREAM%%:*}" "$EDGE_NETWORK" \
      "crowdrelay-${TENANT_LABEL}-api-1" >/dev/null 2>&1 || true
  fi
  # Prove the edge can reach the upstream by name before writing the route.
  if ! docker exec "$EDGE_CONTAINER" wget -qO- --timeout=5 \
       "http://${UPSTREAM}/v1/health/ready" >/dev/null 2>&1; then
    die "edge cannot reach ${UPSTREAM} — is crowdrelay-${TENANT_LABEL}-api-1 attached to ${EDGE_NETWORK} as ${UPSTREAM%%:*}?"
  fi
fi

block="$(cat <<BLOCK

${HOSTNAME_ARG} {
	encode zstd gzip
	import security_headers

	request_body {
		max_size 32KB
	}

	reverse_proxy ${UPSTREAM} {
		health_uri /v1/health/ready
		health_interval 5s
		health_timeout 2s
		transport http {
			dial_timeout 2s
			response_header_timeout 10s
			keepalive 60s
		}
	}
}
BLOCK
)"

if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '%s\n' "$block"
  echo "EDGE_ROUTE=DRY_RUN host=$HOSTNAME_ARG upstream=$UPSTREAM"
  exit 0
fi

backup="${EDGE_CADDYFILE}.$(date -u +%Y%m%dT%H%M%SZ).bak"
cp -p "$EDGE_CADDYFILE" "$backup"
printf '%s\n' "$block" >> "$EDGE_CADDYFILE"

restore() {
  cp -p "$backup" "$EDGE_CADDYFILE"
  docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
}

if ! docker exec "$EDGE_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  restore
  die "the edge config did not validate with the new block — reverted, edge untouched"
fi

if ! docker exec "$EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  restore
  die "the edge refused to reload — reverted, previous config restored"
fi

# A certificate is issued on the first request, so this is the step that proves
# the whole path rather than just the config.
sleep 2
status="$(curl -o /dev/null -sw '%{http_code}' --max-time 20 "https://${HOSTNAME_ARG}/v1/health/ready" || echo 000)"

echo "EDGE_ROUTE=PASS host=$HOSTNAME_ARG upstream=$UPSTREAM backup=$backup public_probe=$status"
if [[ "$status" != "200" ]]; then
  echo "note: the public probe returned $status. Certificate issuance can take a few seconds on a brand-new name; re-run the probe before telling the customer the URL is live." >&2
fi
