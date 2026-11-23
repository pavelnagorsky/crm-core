#!/usr/bin/env bash
# Zero-downtime replacement of a scaled compose service (default: api).
#
# `docker compose up` recreates all replicas of a service at once, so the API would be down for a few
# seconds on every deploy. Instead:
#   1. start N new replicas next to the N running ones (new image/config, old ones untouched);
#   2. wait until every new replica is healthy (Dockerfile HEALTHCHECK on /health);
#   3. stop the old ones (they get stop_grace_period to finish requests) and remove them.
# lb re-resolves the `api` DNS name every 5s and retries a failed upstream, so traffic moves over on its own.
# If a new replica does not become healthy, the new ones are removed and the old ones keep serving.
#
# N is the desired replica count from compose.yaml (API_REPLICAS), so the same command also scales up/down.
# Usage (from the project directory, with IMAGE_TAG etc. exported as for `docker compose up`):
#   scripts/deploy/rollout.sh [service] [timeout_seconds]
set -euo pipefail

service="${1:-api}"
timeout="${2:-180}"

desired="$(docker compose config --format json "$service" | grep -o '"replicas": *[0-9]*' | grep -o '[0-9]*$' || true)"
desired="${desired:-1}"
old_ids="$(docker compose ps -q "$service")"
old_count="$(printf '%s' "$old_ids" | grep -c . || true)"

if [ "$old_count" -eq 0 ]; then
  echo "rollout: no running $service replicas, starting $desired"
  docker compose up -d --no-deps --wait --wait-timeout "$timeout" "$service"
  exit 0
fi

echo "rollout: $service: $old_count running, starting $desired new"
docker compose up -d --no-deps --no-recreate --scale "$service=$((old_count + desired))" "$service"

new_ids="$(docker compose ps -q "$service" | grep -vxF -f <(printf '%s\n' "$old_ids") || true)"
if [ -z "$new_ids" ]; then
  echo "rollout: no new $service containers were created" >&2
  exit 1
fi

remove_new() {
  echo "rollout: new $service replicas failed, keeping the old ones" >&2
  for id in $new_ids; do docker logs --tail 100 "$id" >&2 || true; done
  # shellcheck disable=SC2086
  docker rm -f $new_ids >/dev/null
  exit 1
}

deadline=$(( $(date +%s) + timeout ))
for id in $new_ids; do
  while :; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
    case "$status" in
      healthy) break ;;
      unhealthy|exited|dead) echo "rollout: $id is $status" >&2; remove_new ;;
    esac
    if [ "$(date +%s)" -ge "$deadline" ]; then echo "rollout: $id not healthy after ${timeout}s ($status)" >&2; remove_new; fi
    sleep 2
  done
done

echo "rollout: new replicas healthy, stopping $old_count old"
# No -t: docker uses the container's stop_grace_period, so in-flight requests finish.
# shellcheck disable=SC2086
docker stop $old_ids >/dev/null
# shellcheck disable=SC2086
docker rm $old_ids >/dev/null
echo "rollout: $service now runs $(docker compose ps -q "$service" | grep -c .) replicas"
