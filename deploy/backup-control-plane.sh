#!/usr/bin/env bash
# Nightly dump of the control-plane database.
#
# This lived only on the production host and stopped working on 2026-08-29,
# silently, for nine days. The cause was one line:
#
#   set -a; source "$ENV_FILE"; set +a
#
# `source` executes the file. Someone added
# `REDDIT_SCRAPER_QUERIES=metal polska,doom metal europe,...` — a perfectly
# valid compose value, unquoted — and bash tried to run `polska,doom`, exited
# 127 before reaching pg_dump, and the timer reported failure into a log nobody
# was reading. Nine days of no backups, on the database that holds every
# tenant, operator and audit record.
#
# So this script does not source the environment file. `docker compose` already
# reads it with --env-file, which is a parser, not a shell. Nothing else here
# needs a variable out of it.
#
# It is in the repository now, because a script that only exists on one host is
# a script nobody reviews.
set -Eeuo pipefail

ROOT="${CONTROL_PLANE_ROOT:-/srv/crowdrelay-control-plane}"
ENV_FILE="$ROOT/control-plane.env"
COMPOSE_FILE="$ROOT/compose.production.yml"
BACKUP_DIR="${CONTROL_PLANE_BACKUP_DIR:-$ROOT/backups}"
RETAIN_DAYS="${CONTROL_PLANE_BACKUP_RETAIN_DAYS:-14}"
# Where a verified dump is copied so it does not share a disk with the database
# it protects. Two forms, checked in this order:
#
#   CONTROL_PLANE_BACKUP_OFFSITE_SSH   user@host:path — rsync over SSH
#   CONTROL_PLANE_BACKUP_OFFSITE_REMOTE  remote:path  — rclone
#
# The SSH form is what this deployment uses: virya-home over WireGuard, with a
# key whose authorized_keys entry forces `rrsync -wo`, so the credential on this
# host can write a backup and can do nothing else — not read one back, not open
# a shell. A push key that can also read is a key that exports every tenant's
# database the moment this host is compromised.
OFFSITE_SSH="${CONTROL_PLANE_BACKUP_OFFSITE_SSH:-}"
OFFSITE_SSH_KEY="${CONTROL_PLANE_BACKUP_OFFSITE_SSH_KEY:-/root/.ssh/crowdrelay-backup}"
OFFSITE_REMOTE="${CONTROL_PLANE_BACKUP_OFFSITE_REMOTE:-}"

[[ "$(id -u)" -eq 0 ]] || { echo "Run with sudo/root" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }
[[ -f "$COMPOSE_FILE" ]] || { echo "missing $COMPOSE_FILE" >&2; exit 1; }

install -d -m 0750 "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP="$BACKUP_DIR/.control-plane-$STAMP.sql.gz.tmp"
OUT="$BACKUP_DIR/control-plane-$STAMP.sql.gz"
trap 'rm -f "$TMP"' EXIT

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U control_plane -d control_plane --no-owner --no-privileges \
  | gzip -9 > "$TMP"

# An empty or truncated dump that replaces a good one is worse than a failure.
# gzip -t proves the stream terminated; the size floor catches a dump that
# produced only headers because the connection died early.
gzip -t "$TMP"
size="$(stat -c %s "$TMP")"
minimum="${CONTROL_PLANE_BACKUP_MIN_BYTES:-4096}"
if [[ "$size" -lt "$minimum" ]]; then
  echo "CONTROL_PLANE_BACKUP=FAIL reason=too_small bytes=$size minimum=$minimum" >&2
  exit 1
fi

mv "$TMP" "$OUT"
trap - EXIT
chmod 0640 "$OUT"

offsite=skipped
if [[ -n "$OFFSITE_SSH" ]]; then
  [[ -r "$OFFSITE_SSH_KEY" ]] || {
    echo "CONTROL_PLANE_BACKUP=FAIL reason=offsite_key_unreadable key=$OFFSITE_SSH_KEY" >&2
    exit 1
  }
  if rsync --quiet \
       -e "ssh -i $OFFSITE_SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
       "$OUT" "$OFFSITE_SSH"; then
    offsite=ok
  else
    # A dump that exists in one place only is the failure this job is for.
    echo "CONTROL_PLANE_BACKUP=FAIL reason=offsite_push_failed target=$OFFSITE_SSH" >&2
    exit 1
  fi
elif [[ -n "$OFFSITE_REMOTE" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy --quiet "$OUT" "$OFFSITE_REMOTE" && offsite=ok || {
      echo "CONTROL_PLANE_BACKUP=FAIL reason=offsite_copy_failed remote=$OFFSITE_REMOTE" >&2
      exit 1
    }
  else
    echo "CONTROL_PLANE_BACKUP=FAIL reason=rclone_missing remote=$OFFSITE_REMOTE" >&2
    exit 1
  fi
fi

# Prune only after a verified new dump exists, so a failing job never erodes
# the history it could not add to.
find "$BACKUP_DIR" -type f -name 'control-plane-*.sql.gz' -mtime "+$RETAIN_DAYS" -delete

echo "CONTROL_PLANE_BACKUP=PASS file=$OUT bytes=$size offsite=$offsite retain_days=$RETAIN_DAYS"
