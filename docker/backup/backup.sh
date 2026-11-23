#!/bin/sh
# One database backup: pg_dump (custom format) -> check that it reads back -> upload to the bucket.
# The dump is checked before upload, so a broken or partial file never replaces a good night.
# Old dumps are deleted by the bucket lifecycle rule (the backup key cannot delete or read objects).
# Log lines use the app format ("[time UTC] LEVEL: [Context] ...") so Loki gets the level label.
set -eu
set -o pipefail

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S') UTC] $1: [Backup] $2"; }

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set}"
prefix="${BACKUP_PREFIX:-postgres}"
name="crm-$(date -u '+%Y-%m-%dT%H%M%SZ').dump"
file="/tmp/$name"
trap 'rm -f "$file"' EXIT

started=$(date +%s)
log INFO "started: $name"

if ! pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$file" "$BACKUP_DATABASE_URL"; then
  log ERROR "failed: pg_dump exited with an error, nothing uploaded"
  exit 1
fi

# A truncated or corrupt archive fails to list its table of contents.
if ! pg_restore --list "$file" > /dev/null; then
  log ERROR "failed: dump does not read back, nothing uploaded"
  exit 1
fi

size=$(stat -c %s "$file")
# The key may only create objects: no existence checks (they need read access), no bucket checks.
if ! rclone copyto --no-check-dest --gcs-no-check-bucket --gcs-bucket-policy-only \
    "$file" ":gcs:$BACKUP_BUCKET/$prefix/$name"; then
  log ERROR "failed: upload to gs://$BACKUP_BUCKET/$prefix/$name"
  exit 1
fi

log INFO "completed: gs://$BACKUP_BUCKET/$prefix/$name size=${size}B duration=$(( $(date +%s) - started ))s"
