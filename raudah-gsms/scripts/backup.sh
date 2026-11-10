#!/bin/sh
# PostgreSQL backup (custom format) into $BACKUP_DIR using DATABASE_URL (the ?schema=... suffix is stripped).
# Schedule daily (cron) or use the `backup` service in docker-compose.yml. Restore: pg_restore -d <url> <file>
# NOTE: pruning of old dumps is deliberately left to your retention policy / storage lifecycle rules.
set -eu
DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$DIR"
URL=$(printf '%s' "$DATABASE_URL" | sed 's/?schema=.*//')
pg_dump --format=custom --file "$DIR/raudah-$(date -u +%Y%m%dT%H%M%SZ).dump" "$URL"
echo "backup ok"
