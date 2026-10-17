#!/usr/bin/env bash
# Offline helper only. Never commit dumps or connection strings.
set -euo pipefail
umask 077
usage() {
  echo "Usage:"
  echo "  RAILWAY_DATABASE_URL=<external-railway-dsn> bash migration/postgres-transfer.sh backup [dump-file]"
  echo "  NEON_DATABASE_URL=<neon-dsn> bash migration/postgres-transfer.sh restore [dump-file]"
}
cmd="${1:-}"
dump="${2:-afileon-railway-backup.dump}"
case "$cmd" in
  backup)
    : "${RAILWAY_DATABASE_URL:?RAILWAY_DATABASE_URL is required (reachable from this machine)}"
    command -v pg_dump >/dev/null || { echo "pg_dump missing" >&2; exit 1; }
    if [[ -e "$dump" ]]; then
      echo "Refusing to overwrite an existing database backup: $dump" >&2
      exit 1
    fi
    pg_dump --dbname="$RAILWAY_DATABASE_URL" --format=custom --compress=6 \
      --no-owner --no-acl --file="$dump"
    echo "Backup written locally: $dump (keep encrypted and never commit to GitHub)"
    ;;
  restore)
    : "${NEON_DATABASE_URL:?NEON_DATABASE_URL is required}"
    [[ -f "$dump" ]] || { echo "Backup not found: $dump" >&2; exit 1; }
    command -v psql >/dev/null || { echo "psql missing" >&2; exit 1; }
    command -v pg_restore >/dev/null || { echo "pg_restore missing" >&2; exit 1; }
    user_tables="$(psql "$NEON_DATABASE_URL" -At -v ON_ERROR_STOP=1 -c \
      "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%';")"
    if [[ "$user_tables" != "0" ]]; then
      echo "Refusing to restore: destination contains $user_tables user tables. Use a fresh Neon database." >&2
      exit 1
    fi
    pg_restore --dbname="$NEON_DATABASE_URL" --no-owner --no-acl \
      --exit-on-error --single-transaction "$dump"
    echo "Restore completed. Independently verify row counts, schema and payments before changing traffic."
    ;;
  *)
    usage
    exit 2
    ;;
esac
