#!/usr/bin/env bash
# vps-disk-guard.sh — daily SAFE-trash sweep for CrowdRelay tenant VPSes.
#
# Deletes only things that are unambiguously disposable:
#   - /tmp, /var/tmp entries older than 24h (system-private dirs excluded)
#   - rotated logs >14d, journal above 100M, crash dumps, coredumps
#   - apt cache + orphaned packages
#   - user caches (~/.cache, ~/.npm/_cacache, ~/.cargo/registry) by entry age
#   - docker: dangling images, build cache >72h, unattached volumes
#   - runner _work dirs — ONLY while no CI job is running
#
# NEVER touches: tagged/in-use images, any container's volumes, stopped
# rollback containers, /srv, /opt, databases, anything under /var/lib/docker
# directly (docker CLI only).
#
# Install:  sudo ./vps-disk-guard.sh --install   (cron.daily + /usr/local/sbin)
# Run once: sudo ./vps-disk-guard.sh

set -uo pipefail

AGE_HOURS="${VPS_GUARD_AGE_HOURS:-24}"
LOG=/var/log/vps-disk-guard.log
[[ -w /var/log ]] || LOG=/tmp/vps-disk-guard.log

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; }

if [[ "${1:-}" == "--install" ]]; then
  install -m 0755 "$0" /usr/local/sbin/vps-disk-guard.sh
  cat >/etc/cron.daily/vps-disk-guard <<'EOF'
#!/bin/sh
exec /usr/local/sbin/vps-disk-guard.sh
EOF
  chmod 0755 /etc/cron.daily/vps-disk-guard
  # Pressure check every 30 min — a flood can fill the disk between daily
  # runs, so sweep early whenever usage crosses 85%.
  cat >/etc/cron.d/vps-disk-guard-pressure <<'EOF'
*/30 * * * * root /usr/local/sbin/vps-disk-guard.sh --if-pressure
EOF
  chmod 0644 /etc/cron.d/vps-disk-guard-pressure
  echo "installed: /usr/local/sbin/vps-disk-guard.sh + cron.daily + 30-min pressure check"
  exit 0
fi

# --if-pressure: run the sweep only when the disk is actually under pressure.
if [[ "${1:-}" == "--if-pressure" ]]; then
  used_pct=$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')
  [[ "${used_pct:-0}" -ge 85 ]] || exit 0
fi

freed_start=$(df --output=avail -B1 / 2>/dev/null | tail -1 | tr -d ' ')
log "--- pass start (avail: $(( ${freed_start:-0} / 1048576 )) MB) ---"

# ── /tmp and /var/tmp: entries cold for 24h ─────────────────────────────
# -xdev stays on the filesystem; systemd-private-* and socket dirs are
# skipped because deleting them breaks live services with PrivateTmp.
for base in /tmp /var/tmp; do
  [[ -d "$base" ]] || continue
  find "$base" -xdev -mindepth 1 -depth \
    -not -newermt "$AGE_HOURS hours ago" \
    \( -name 'systemd-private-*' -o -name 'snap.*' -o -name '.X11-unix' \
       -o -name '.ICE-unix' -o -name '.font-unix' -o -name '.XIM-unix' \
       -o -name '.Test-unix' \) -prune -o \
    -delete 2>/dev/null
done

# ── logs, journals, crash dumps ──────────────────────────────────────────
find /var/log -xdev -type f \( -name '*.gz' -o -name '*.1' -o -name '*.old' \) \
  -mtime +14 -delete 2>/dev/null
command -v journalctl >/dev/null && journalctl --vacuum-size=100M >/dev/null 2>&1
rm -rf /var/crash/* /var/lib/systemd/coredump/* 2>/dev/null

# ── apt ──────────────────────────────────────────────────────────────────
if command -v apt-get >/dev/null; then
  apt-get clean >/dev/null 2>&1
  apt-get -y autoremove --purge >/dev/null 2>&1
fi

# ── user caches (rebuildable, swept by entry age) ───────────────────────
for home in /root /home/*; do
  for c in "$home/.cache" "$home/.npm/_cacache" "$home/.cargo/registry"; do
    [[ -d "$c" ]] || continue
    find "$c" -type f -not -newermt "$AGE_HOURS hours ago" -delete 2>/dev/null
    find "$c" -type d -empty -delete 2>/dev/null
  done
done

# ── docker: only via the CLI, only the safe classes ─────────────────────
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  docker image prune -f >/dev/null 2>&1                 # dangling only
  docker builder prune -f --filter until=72h >/dev/null 2>&1
  docker volume prune -f >/dev/null 2>&1                # unattached only
fi

# ── runner _work: only when NO job is active ────────────────────────────
if ! pgrep -f 'Runner\.Worker' >/dev/null 2>&1; then
  for work in /home/*/actions-runner*/_work; do
    [[ -d "$work" ]] || continue
    find "$work" -mindepth 1 -maxdepth 1 -depth \
      -not -newermt "$AGE_HOURS hours ago" \
      \( -name '_temp' -o -name '_actions' -o -name '_tool' \
         -o -name '_PipelineMapping' \) -prune -o \
      -exec rm -rf {} + 2>/dev/null
  done
fi

freed_end=$(df --output=avail -B1 / 2>/dev/null | tail -1 | tr -d ' ')
log "--- pass end (avail: $(( ${freed_end:-0} / 1048576 )) MB, delta: $(( (${freed_end:-0} - ${freed_start:-0}) / 1048576 )) MB) ---"
