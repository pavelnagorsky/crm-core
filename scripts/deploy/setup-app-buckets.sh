#!/usr/bin/env bash
# One-time Google Cloud setup of the application file buckets for one environment. Safe to re-run.
#
# Creates, with the same settings as the existing stage buckets:
#   - <public>: uniform access, objects readable by anyone (images, public files);
#   - <private>: public access blocked, CORS for GET/HEAD of signed links (client documents);
#   - a service account with roles/storage.objectAdmin on these two buckets ONLY
#     (not on the project: it must not reach other environments or the backup bucket);
#   - its key in secrets/google-credentials.<env>.json (git-ignored). On the server it becomes
#     <DEPLOY_PATH>/secrets/google-credentials.json.
#
# Usage (after `gcloud auth login`):
#   bash scripts/deploy/setup-app-buckets.sh <project-id> <env> <public-bucket> <private-bucket> [location]
set -euo pipefail

project="${1:?project id}"
env_name="${2:?environment name, e.g. production}"
public_bucket="${3:?public bucket}"
private_bucket="${4:?private bucket}"
location="${5:-europe-central2}"
account="klendo-core-$env_name"
email="$account@$project.iam.gserviceaccount.com"
key_file="secrets/google-credentials.$env_name.json"

echo "Project: $project, environment: $env_name"
echo "Public:  gs://$public_bucket   Private: gs://$private_bucket   ($location)"
echo "Account: $email"

create_bucket() {
  local bucket="$1"; shift
  if gcloud storage buckets describe "gs://$bucket" --project "$project" >/dev/null 2>&1; then
    echo "bucket exists: $bucket"
  else
    gcloud storage buckets create "gs://$bucket" --project "$project" --location "$location" \
      --uniform-bucket-level-access "$@"
  fi
}

create_bucket "$public_bucket"
gcloud storage buckets add-iam-policy-binding "gs://$public_bucket" --project "$project" \
  --member allUsers --role roles/storage.objectViewer >/dev/null

create_bucket "$private_bucket" --public-access-prevention
cors="$(mktemp)"
trap 'rm -f "$cors"' EXIT
cat > "$cors" <<'JSON'
[{"origin": ["*"], "method": ["GET", "HEAD"],
  "responseHeader": ["Content-Type", "Content-Disposition", "Content-Length"], "maxAgeSeconds": 3600}]
JSON
gcloud storage buckets update "gs://$private_bucket" --project "$project" --cors-file="$cors"

if gcloud iam service-accounts describe "$email" --project "$project" >/dev/null 2>&1; then
  echo "service account exists"
else
  gcloud iam service-accounts create "$account" --project "$project" \
    --display-name "Klendo core ($env_name): application files"
fi
for bucket in "$public_bucket" "$private_bucket"; do
  gcloud storage buckets add-iam-policy-binding "gs://$bucket" --project "$project" \
    --member "serviceAccount:$email" --role roles/storage.objectAdmin >/dev/null
done

if [ -s "$key_file" ] && grep -q "\"client_email\": *\"$email\"" "$key_file"; then
  echo "key exists: $key_file"
else
  mkdir -p secrets
  gcloud iam service-accounts keys create "$key_file" --iam-account "$email" --project "$project"
fi

echo
echo "Done. In .env.$env_name: GOOGLE_BUCKET_NAME=$public_bucket, GOOGLE_PRIVATE_BUCKET_NAME=$private_bucket,"
echo "GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-credentials.json; on the server copy"
echo "$key_file to <DEPLOY_PATH>/secrets/google-credentials.json (readable by UID 1000)."
