#!/bin/sh
set -eu
if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then echo 'Usage: sh infrastructure/scripts/restore.sh BACKUP.dump'; exit 1; fi
# Restore only into a fresh scratch database; never overwrite the development database.
docker compose --env-file infrastructure/docker/.env -f infrastructure/docker/docker-compose.yml exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" circle_social_restore'
docker compose --env-file infrastructure/docker/.env -f infrastructure/docker/docker-compose.yml exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d circle_social_restore --no-owner --exit-on-error' < "$1"
echo 'Restored into circle_social_restore. Development database unchanged.'
