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
#   sudo bash scripts/add-tenant-edge-route.sh api.band.example 18101 --dry-run
#
# Run the preflight first. It checks DNS, which has to be correct before Caddy
# can issue a certificate for the name.
set -Eeuo pipefail

HOSTNAME_ARG="${1:-}"
PORT_ARG="${2:-}"
DRY_RUN=0
[[ "${3:-}" == "--dry-run" ]] && DRY_RUN=1

EDGE_CADDYFILE="${EDGE_CADDYFILE:-/opt/crowdrelay/ops/edge/Caddyfile}"
EDGE_CONTAINER="${EDGE_CONTAINER:-virya-edge-caddy}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -n "$HOSTNAME_ARG" && -n "$PORT_ARG" ]] \
  || die "usage: $0 <public-hostname> <tenant-api-port> [--dry-run]"
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

block="$(cat <<BLOCK

${HOSTNAME_ARG} {
	encode zstd gzip
	import security_headers

	request_body {
		max_size 32KB
	}

	reverse_proxy 127.0.0.1:${PORT_ARG} {
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
  echo "EDGE_ROUTE=DRY_RUN host=$HOSTNAME_ARG port=$PORT_ARG"
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

echo "EDGE_ROUTE=PASS host=$HOSTNAME_ARG port=$PORT_ARG backup=$backup public_probe=$status"
if [[ "$status" != "200" ]]; then
  echo "note: the public probe returned $status. Certificate issuance can take a few seconds on a brand-new name; re-run the probe before telling the customer the URL is live." >&2
fi
