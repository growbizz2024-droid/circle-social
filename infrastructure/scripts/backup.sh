#!/bin/sh
set -eu
umask 077
mkdir -p artifacts/backups
destination="artifacts/backups/circle-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file infrastructure/docker/.env -f infrastructure/docker/docker-compose.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$destination"
if [ ! -s "$destination" ]; then rm -f "$destination"; exit 1; fi
printf 'Backup saved to %s (private, Git-ignored).\n' "$destination"
