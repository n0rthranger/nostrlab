#!/usr/bin/env bash
set -euo pipefail

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ "${1:-}" == "--" ]]; then
  shift
fi

dump="${1:-}"
if [[ -z "$dump" || ! -f "$dump" ]]; then
  echo "Usage: bash scripts/restore-postgres.sh /path/to/nostrlab.dump" >&2
  exit 1
fi

if [[ -f "$dump.sha256" ]]; then
  sha256sum --check "$dump.sha256"
fi

if command -v pg_restore >/dev/null 2>&1; then
  pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --dbname "$DATABASE_URL" \
    "$dump"
else
  container="${POSTGRES_CONTAINER:-nostrlab-postgres}"
  if ! command -v podman >/dev/null 2>&1 || ! podman container exists "$container"; then
    echo "pg_restore is required, or set POSTGRES_CONTAINER to a running local Postgres container" >&2
    exit 1
  fi
  podman exec -i "$container" pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    -U "${POSTGRES_USER:-nostrlab}" \
    -d "${POSTGRES_DB:-nostrlab}" < "$dump"
fi

echo "restored=$dump"
