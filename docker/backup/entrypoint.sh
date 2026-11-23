#!/bin/sh
# `schedule` (default): run backup.sh by BACKUP_CRON with busybox crond, output to the container log.
# `now`: one backup right away (first setup check, before risky maintenance).
set -eu

case "${1:-schedule}" in
  now)
    exec backup.sh
    ;;
  schedule)
    : "${BACKUP_CRON:?BACKUP_CRON is not set}"
    # crond starts jobs with an empty environment: pass the settings through a file.
    env | grep -E '^(BACKUP_|RCLONE_|PG|TZ=)' | sed "s/'/'\\\\''/g; s/=\(.*\)/='\1'/; s/^/export /" > /etc/backup.env
    chmod 600 /etc/backup.env
    echo "$BACKUP_CRON . /etc/backup.env; backup.sh > /proc/1/fd/1 2> /proc/1/fd/2" | crontab -
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S') UTC] INFO: [Backup] scheduled: '$BACKUP_CRON' (TZ=${TZ:-UTC}), bucket $BACKUP_BUCKET"
    exec crond -f -l 8
    ;;
  *)
    exec "$@"
    ;;
esac
