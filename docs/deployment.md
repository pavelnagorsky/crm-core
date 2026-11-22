# Деплой на VPS

Workflow: `.github/workflows/prod-deploy.yml`. Триггер — push в `master`.

GitHub Actions запускает проверки и тесты, затем подключается к VPS по SSH.
На сервере получает коммит из push, собирает образы, выполняет миграции и поочерёдно
перезапускает сервисы Docker Compose. Все команды находятся прямо в workflow.

## Стек Docker Compose

Описание стека — `compose.yaml` в корне. Сервисы:

| Сервис | Назначение |
| --- | --- |
| `api-1`, `api-2` | HTTP API (`APP_ROLE=api`, без кронов), один образ |
| `worker` | Кроны (`APP_ROLE=worker`), тот же образ |
| `lb` | nginx, балансировщик на `127.0.0.1:${APP_PORT:-3000}`; хостовый nginx (TLS, лимиты) проксирует на него |
| `redis` | Кэш, счётчики rate limit, блокировки кронов |
| `loki`, `alloy`, `grafana` | Логи контейнеров и UI (`127.0.0.1:3200`, наружу не публиковать) |
| `migrate` | Одноразовый: применяет миграции |
| `postgres` | Только локально (профиль `local`); на сервере БД снаружи, адрес в `DOCKER_DATABASE_URL` |

Логи приложения идут в stdout и собираются в Loki, файлов `DEPLOY_PATH/logs` больше нет.
Как искать ошибку по `requestId` — в [инструкции по логам](logging.md).

## Порядок деплоя

1. `git checkout --detach $DEPLOY_SHA`, `IMAGE_TAG=$DEPLOY_SHA`.
2. `docker compose build` (образы приложения и `migrate`).
3. `docker compose run --rm --no-deps migrate`.
4. `docker compose up -d --no-deps redis loki alloy grafana lb` — неизменённые контейнеры не пересоздаются.
5. Rolling restart: `up -d --no-deps --wait` для `api-1`, затем `api-2`, затем `worker`.
   `--wait` ждёт `healthy`; пока перезапускается один api, `lb` отдаёт трафик второму.
6. Если сервис не стал `healthy`, workflow печатает `docker compose logs --tail 100 <сервис>`
   и завершается с ошибкой; остальные сервисы остаются на предыдущей версии.

## Настройка сервера

На VPS нужны Git и Docker с плагином Compose v2. Пользователь деплоя должен иметь доступ к Docker
и к репозиторию через `git fetch origin master`.

1. Клонировать репозиторий в `/opt/crm-core`.
2. Создать там `.env` по `.env.example` с реальными настройками.
   Адрес БД для контейнеров задаётся `DOCKER_DATABASE_URL`: `localhost` внутри контейнера
   указывает на сам контейнер, а не на хост. `REDIS_URL` и `APP_ROLE` compose задаёт сам.
   Задать `GRAFANA_ADMIN_PASSWORD`.
3. Если используется файл Google Cloud credentials, положить его в
   `/opt/crm-core/secrets/google-credentials.json` и задать в `.env`:
   `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-credentials.json`.
   Файл должен читаться пользователем контейнера с UID 1000.
4. Настроить HTTPS reverse proxy на `127.0.0.1:3000` с лимитами из
   [rate-limiting.md](rate-limiting.md#nginx).

## GitHub Secrets

| Secret                    | Значение                                            |
| ------------------------- | --------------------------------------------------- |
| `DEPLOY_HOST`             | Адрес VPS                                           |
| `DEPLOY_USER`             | SSH-пользователь                                    |
| `DEPLOY_SSH_KEY`          | Приватный SSH-ключ                                  |
| `DEPLOY_HOST_FINGERPRINT` | Проверенный SHA256 fingerprint SSH host key сервера |

Опциональные GitHub Variables:

| Variable         | По умолчанию    |
| ---------------- | --------------- |
| `DEPLOY_PATH`    | `/opt/crm-core` |
| `DEPLOY_PORT`    | `22`            |
| `APP_PORT`       | `3000`          |

Сборка и миграции выполняются до перезапуска сервисов. Простоя API нет, пока работает
хотя бы один из `api-1` / `api-2`.

**Миграции обязаны быть совместимы с предыдущей версией кода.** Во время rolling restart
(и при неудачном деплое, остановившемся посередине) несколько минут одновременно работают
старый и новый код на уже применённой новой схеме. Поэтому деструктивные изменения
(удаление и переименование колонок и таблиц, ужесточение `NOT NULL`, смена типов) делаются
в два релиза: сначала код перестаёт использовать поле, в следующем релизе миграция его
удаляет. Автоматического отката БД нет.

## Письма и очередь задач (pg-boss)

Все письма пишутся в журнал (`EmailMessage`) и отправляются через pg-boss. Он хранит задачи в
схеме `pgboss` той же БД и при старте сам создаёт и мигрирует её. Пользователю из `DATABASE_URL`
нужно право `CREATE` на базу. Если его нет, один раз создать схему вручную:
`CREATE SCHEMA pgboss AUTHORIZATION <user>;`. Prisma эту схему не видит и не трогает.

- Если очередь не стартовала, приложение всё равно работает: письма копятся в журнале, очередь
  пытается подняться каждые 30 с и забирает их. В админке это видно как статус `DOWN`.
- Пул pg-boss - до 3 соединений сверх пула Prisma (см. [соединения с БД](#соединения-с-бд)).
- При остановке письма, которые уже отправляются, дописываются. Прерванная попытка повторится
  через ~2 минуты.
- SMTP: `SMTP_HOST` (по умолчанию `smtp.hoster.by`), `SMTP_PORT` (465 - TLS сразу, другие -
  STARTTLS), логин `EMAIL` / `EMAIL_PW`.
- Журнал, повтор и отмена писем, проверка SMTP - в админке, API `/admin/notifications/emails`
  ([frontend-email-notifications.md](frontend-email-notifications.md)).

`.dockerignore` исключает из контекста сборки локальные зависимости, сборку,
Git, `.env` и ключи. Конфигурация и секреты передаются только при запуске.

## Соединения с БД

Каждый процесс держит пул Prisma размером `DATABASE_POOL_SIZE` (по умолчанию 10) и пул pg-boss
на 3 соединения. Итого:

```
(2 api + 1 worker) × (10 Prisma + 3 pg-boss) = 39 соединений + миграции
```

Стандартный `max_connections = 100` в PostgreSQL — с запасом. При увеличении
`DATABASE_POOL_SIZE` или числа реплик пересчитать по этой формуле.
