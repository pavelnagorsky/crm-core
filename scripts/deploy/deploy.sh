#!/usr/bin/env bash
# Deploys one release on the server. Called by .github/workflows/deploy.yml over SSH after it copied
# compose.yaml, docker/ and scripts/deploy/ to the deploy directory; can also be run by hand.
#
#   IMAGE_TAG=<commit sha> [REGISTRY_USER=<github user>] bash scripts/deploy/deploy.sh
#
# With REGISTRY_USER the GHCR token is read from stdin and used only by this run (a temporary docker
# config): the host is shared, other projects keep their own registry logins.
#
# Order: pull images -> migrations -> infrastructure -> API replicas without downtime -> worker.
# IMAGE_TAG is saved to .env only after a successful deploy, so manual `docker compose` commands
# and scripts/deploy/rollout.sh use the released images.
set -euo pipefail

cd "$(dirname "$0")/../.."

: "${IMAGE_TAG:?IMAGE_TAG (commit sha) is required}"
test -f .env || { echo 'deploy: .env is missing' >&2; exit 1; }
CORE_IMAGE="$(grep -E '^CORE_IMAGE=' .env | tail -n 1 | cut -d= -f2-)"
test -n "$CORE_IMAGE" || { echo 'deploy: CORE_IMAGE is not set in .env' >&2; exit 1; }
export IMAGE_TAG
mkdir -p secrets

if [ -n "${REGISTRY_USER:-}" ]; then
  DOCKER_CONFIG="$(mktemp -d)"
  export DOCKER_CONFIG
  trap 'rm -rf "$DOCKER_CONFIG"' EXIT
  docker login ghcr.io -u "$REGISTRY_USER" --password-stdin >/dev/null
fi

docker pull --quiet "$CORE_IMAGE:$IMAGE_TAG"
docker pull --quiet "$CORE_IMAGE:$IMAGE_TAG-migrate"

docker compose run --rm --no-deps migrate

docker compose up -d --no-deps redis loki alloy prometheus postgres-exporter redis-exporter grafana lb

# lb is not recreated when only docker/nginx/lb.conf changed: reload it. A broken config fails the
# deploy here, and nginx keeps serving with the previous one.
docker compose exec -T lb nginx -t
docker compose exec -T lb nginx -s reload

# API: new replicas start next to the old ones and take over once healthy (no downtime).
bash scripts/deploy/rollout.sh api 180

# Daily database backups: only where enabled (COMPOSE_PROFILES=backup in .env).
if docker compose config --services | grep -qx backup; then
  docker compose up -d --no-deps --build backup
fi

# Crons run in a single worker: a short gap on restart is fine.
if ! docker compose up -d --no-deps --wait --wait-timeout 180 worker; then
  docker compose logs --tail 100 worker
  exit 1
fi

sed -i '/^IMAGE_TAG=/d' .env
printf 'IMAGE_TAG=%s\n' "$IMAGE_TAG" >> .env

# Keep the 3 newest releases for a rollback. Never prune globally: the host is shared.
docker images "$CORE_IMAGE" --format '{{.Repository}}:{{.Tag}}' | grep -v -- '-migrate$' | tail -n +4 |
  xargs -r docker rmi >/dev/null 2>&1 || true
docker images "$CORE_IMAGE" --format '{{.Repository}}:{{.Tag}}' | grep -- '-migrate$' | tail -n +4 |
  xargs -r docker rmi >/dev/null 2>&1 || true

echo "deploy: $IMAGE_TAG is live"
