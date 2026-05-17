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

backup_dir="${BACKUP_DIR:-./backups/postgres}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"

target="$backup_dir/nostrlab-${timestamp}.dump"
manifest="$target.sha256"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump \
    --format=custom \
    --no-owner \
    --no-acl \
    --dbname "$DATABASE_URL" \
    --file "$target"
else
  container="${POSTGRES_CONTAINER:-nostrlab-postgres}"
  if ! command -v podman >/dev/null 2>&1 || ! podman container exists "$container"; then
    echo "pg_dump is required, or set POSTGRES_CONTAINER to a running local Postgres container" >&2
    exit 1
  fi
  podman exec "$container" pg_dump \
    --format=custom \
    --no-owner \
    --no-acl \
    -U "${POSTGRES_USER:-nostrlab}" \
    -d "${POSTGRES_DB:-nostrlab}" > "$target"
fi

sha256sum "$target" > "$manifest"

echo "backup=$target"
echo "sha256=$manifest"
echo "restore=bash scripts/restore-postgres.sh $target"
