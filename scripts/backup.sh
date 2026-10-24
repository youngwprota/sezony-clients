#!/bin/sh
# Ежедневная копия базы в /backups (папка ./backups на сервере). Хранятся последние KEEP_DAYS дней.
set -eu
KEEP_DAYS="${KEEP_DAYS:-30}"
mkdir -p /backups
while true; do
  file="/backups/sezony-$(date +%Y-%m-%d_%H%M).sql.gz"
  if pg_dump --no-owner --clean --if-exists | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "backup ok: $file"
  else
    rm -f "$file.tmp"
    echo "backup FAILED" >&2
  fi
  find /backups -name 'sezony-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done
