#!/usr/bin/env bash
# One-time Google Cloud setup for database backups (docs/backups.md). Safe to re-run.
#
# Creates:
#   - a private bucket (uniform access, public access blocked) with a lifecycle rule deleting dumps
#     after RETENTION_DAYS;
#   - a service account that may only CREATE objects in that bucket (roles/storage.objectCreator):
#     it cannot list, read, overwrite or delete, so a compromised server cannot wipe or steal backups;
#   - a key for it in secrets/backup-gcs.json (git-ignored), to be copied to the server.
#
# Usage (after `gcloud auth login`):
#   bash scripts/deploy/setup-backup-bucket.sh <project-id> <bucket-name> [location] [retention-days]
set -euo pipefail

project="${1:?project id}"
bucket="${2:?bucket name}"
location="${3:-europe-central2}"
retention="${4:-30}"
account="klendo-db-backup"
email="$account@$project.iam.gserviceaccount.com"
key_file="secrets/backup-gcs.json"

echo "Project:   $project"
echo "Bucket:    gs://$bucket ($location), dumps deleted after $retention days"
echo "Account:   $email (create-only)"

if gcloud storage buckets describe "gs://$bucket" --project "$project" >/dev/null 2>&1; then
  echo "bucket exists"
else
  gcloud storage buckets create "gs://$bucket" --project "$project" --location "$location" \
    --uniform-bucket-level-access --public-access-prevention
fi

lifecycle="$(mktemp)"
trap 'rm -f "$lifecycle"' EXIT
printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":%d}}]}\n' "$retention" > "$lifecycle"
gcloud storage buckets update "gs://$bucket" --project "$project" --lifecycle-file="$lifecycle"

if gcloud iam service-accounts describe "$email" --project "$project" >/dev/null 2>&1; then
  echo "service account exists"
else
  gcloud iam service-accounts create "$account" --project "$project" \
    --display-name "CRM database backups (create-only)"
fi

gcloud storage buckets add-iam-policy-binding "gs://$bucket" --project "$project" \
  --member "serviceAccount:$email" --role roles/storage.objectCreator >/dev/null

if [ -s "$key_file" ] && grep -q "\"client_email\": *\"$email\"" "$key_file"; then
  echo "key exists: $key_file"
else
  mkdir -p secrets
  gcloud iam service-accounts keys create "$key_file" --iam-account "$email" --project "$project"
fi

echo
echo "Done. Next:"
echo "  1. .env: BACKUP_BUCKET=$bucket and COMPOSE_PROFILES=backup (comma-separated with other profiles)"
echo "  2. docker compose run --rm backup now     # first real backup"
echo "  3. on the server: copy $key_file to <deploy path>/$key_file and set the same .env values"
