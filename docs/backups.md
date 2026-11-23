# Бэкапы базы данных

Раз в сутки (03:30 по Минску) контейнер `backup` делает `pg_dump` боевой базы, проверяет, что
дамп читается, и загружает его в отдельный приватный бакет Google Cloud Storage. Дампы старше
30 дней удаляет правило самого бакета.

```text
backup (cron 03:30) ──pg_dump──► /tmp/crm-<время>.dump ──pg_restore --list──► gs://<бакет>/postgres/
```

## Устройство

| Что | Где |
| --- | --- |
| Контейнер | сервис `backup` в `compose.yaml`, образ из `docker/backup/` (Postgres 17 + rclone), профиль `backup` |
| Скрипт | `docker/backup/backup.sh`; расписание — busybox `crond` (`docker/backup/entrypoint.sh`) |
| Какая база | `DOCKER_DATABASE_URL` (та же, что у приложения); локально — `postgres` из compose |
| Куда | `gs://$BACKUP_BUCKET/postgres/crm-<UTC-время>.dump`, формат `pg_dump --format=custom` |
| Доступ | ключ `secrets/backup-gcs.json` сервисного аккаунта `crm-db-backup` с ролью **только создание объектов** (`roles/storage.objectCreator`) |
| Хранение | правило бакета: удалить через 30 дней; плюс стандартное «мягкое удаление» GCS (7 дней) |

Почему ключ «только на запись»: если сервер или приложение взломают, этим ключом нельзя ни
скачать дампы (в них все клиенты), ни удалить или перезаписать их. Ключ приложения
(`cloud-storage.json`) к бакету бэкапов доступа не имеет.

Дамп проверяется до загрузки: если `pg_dump` упал или файл не читается, в бакет ничего не
уходит, а в лог пишется `ERROR: [Backup] failed: ...`.

## Первичная настройка (один раз)

1. Войти в Google Cloud: `gcloud auth login` (аккаунт с правами на проект).
2. Создать бакет, правило хранения, сервисный аккаунт и ключ:

   ```bash
   bash scripts/deploy/setup-backup-bucket.sh <project-id> <имя-бакета>
   # регион по умолчанию europe-central2 (Варшава), хранение 30 дней; можно передать третьим и четвёртым аргументом
   ```

   Ключ появится в `secrets/backup-gcs.json` (не коммитится).
3. В `.env`:

   ```
   BACKUP_BUCKET=<имя-бакета>
   COMPOSE_PROFILES=backup
   ```

   Если `COMPOSE_PROFILES` уже задан (например, `host-metrics`), значения через запятую.
4. Проверить вручную: `docker compose run --rm backup now` → в выводе
   `INFO: [Backup] completed: gs://...`. Файл виден в консоли Google Cloud → Cloud Storage.
5. На сервере: скопировать `secrets/backup-gcs.json` в `<DEPLOY_PATH>/secrets/`, прописать те же
   строки в `.env` сервера. Следующий деплой поднимет `backup` сам; или сразу
   `docker compose up -d backup`.

Локально бэкапы по расписанию не нужны: без профиля `backup` контейнер не запускается.

## Как понять, что бэкапы делаются

- Grafana → «CRM — логи», «Контейнер» = `backup`: каждую ночь пара строк `started` / `completed`
  с размером и длительностью; при сбое — `ERROR`.
- Алерт «Бэкап не сделан» (нет строки `completed` больше 26 часов) — в плане метрик
  (`docs/metrics-plan.md`, раздел 2.5).
- `docker compose logs backup --tail 20` на сервере.

Сделать внеплановый бэкап (перед рискованной миграцией, ручной правкой данных):
`docker compose run --rm backup now`.

## Восстановление

Ключ бэкапа читать не умеет, поэтому скачивает дамп человек со своим доступом:

```bash
# 1. Какие есть дампы
gcloud storage ls gs://<бакет>/postgres/

# 2. Скачать нужный
gcloud storage cp gs://<бакет>/postgres/crm-2026-11-24T003000Z.dump ./restore.dump

# 3. Развернуть в ПУСТУЮ базу (сначала всегда в отдельную, чтобы посмотреть, что там)
createdb -h <host> -U <user> restore_check
pg_restore -h <host> -U <user> -d restore_check --no-owner --no-privileges ./restore.dump
```

Локально (Postgres из compose):

```bash
docker compose cp ./restore.dump postgres:/tmp/restore.dump
docker compose exec postgres createdb -U crm restore_check
docker compose exec postgres pg_restore -U crm -d restore_check --no-owner /tmp/restore.dump
```

Подменять боевую базу — только после проверки восстановленной копии и с остановленными
`api`/`worker` (`docker compose stop api worker`), затем `migrate` и запуск.

**Раз в квартал** — учебное восстановление последнего дампа в отдельную базу и сверка числа
строк в основных таблицах. Бэкап, который ни разу не восстанавливали, — не бэкап.

## Настройки

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `BACKUP_BUCKET` | — | бакет для дампов (обязателен) |
| `BACKUP_PREFIX` | `postgres` | папка в бакете |
| `BACKUP_CRON` | `30 3 * * *` | расписание (cron, 5 полей) |
| `BACKUP_TZ` | `Europe/Minsk` | часовой пояс расписания |
| `COMPOSE_PROFILES` | — | `backup` включает сервис |

Ограничения: дамп — снимок раз в сутки, потеря до 24 часов данных при полной гибели сервера.
Восстановление на любую минуту (PITR, WAL-архив) — в managed Postgres или отдельной задачей.
