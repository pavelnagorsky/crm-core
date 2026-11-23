#!/usr/bin/env bash
# Issues a read-only (Viewer) Grafana service account token for the AI agent's Grafana MCP server
# (docs/logging.md, "Логи через ИИ-агента"). Safe to re-run: the account is reused, each run adds a new token.
#
# Usage:
#   bash scripts/grafana-mcp-token.sh                         # local stack, password from .env
#   GRAFANA_URL=http://127.0.0.1:3201 GRAFANA_ADMIN_PASSWORD=... bash scripts/grafana-mcp-token.sh   # prod via SSH tunnel
#
# Prints only the token to stdout.
set -euo pipefail

url="${GRAFANA_URL:-http://127.0.0.1:3200}"
account="ai-agent"

password="${GRAFANA_ADMIN_PASSWORD:-}"
if [ -z "$password" ] && [ -f .env ]; then
  password="$(sed -n 's/^GRAFANA_ADMIN_PASSWORD=//p' .env | tail -n1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"
fi
[ -n "$password" ] || { echo 'GRAFANA_ADMIN_PASSWORD is not set (env or .env)' >&2; exit 1; }

# Credentials go through a curl config on stdin, not argv, so they do not show up in the process list.
api() {
  local method="$1" path="$2" body="${3:-}"
  local escaped="${password//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  printf 'user = "admin:%s"\n' "$escaped" | curl -sSf -K - -X "$method" \
    -H 'Content-Type: application/json' ${body:+--data "$body"} "$url$path"
}

id="$(api GET "/api/serviceaccounts/search?query=$account" | grep -o '"id":[0-9]*' | head -n1 | cut -d: -f2 || true)"
if [ -z "$id" ]; then
  id="$(api POST /api/serviceaccounts "{\"name\":\"$account\",\"role\":\"Viewer\"}" | grep -o '"id":[0-9]*' | head -n1 | cut -d: -f2)"
  echo "Created service account '$account' (Viewer), id=$id" >&2
fi

token="$(api POST "/api/serviceaccounts/$id/tokens" "{\"name\":\"$account-$(date -u +%Y%m%d%H%M%S)\"}" \
  | grep -o '"key":"[^"]*"' | cut -d'"' -f4)"
[ -n "$token" ] || { echo 'Grafana returned no token' >&2; exit 1; }
printf '%s\n' "$token"
