# Деплой на VPS

Workflow: `.github/workflows/prod-deploy.yml`. Триггер — push в `master`.

GitHub Actions запускает проверки и тесты, затем подключается к VPS по SSH.
На сервере получает коммит из push, собирает Docker-образы, выполняет миграции,
перезапускает контейнер `crm-core` и проверяет его healthcheck.
Все команды находятся прямо в workflow.

Логи сохраняются в `DEPLOY_PATH/logs` между деплоями. Как открыть их через ispmanager,
найти ошибку по `requestId` и выдать права на чтение — в [инструкции по логам](logging.md).

## Настройка сервера

На VPS нужны Git и Docker. Пользователь деплоя должен иметь доступ к Docker
и к репозиторию через `git fetch origin master`.

1. Клонировать репозиторий в `/opt/crm-core`.
2. Создать там `.env` по `.env.example` с реальными настройками.
   `DATABASE_URL` должен быть доступен из контейнера: `localhost` внутри него
   указывает на сам контейнер. Если PostgreSQL работает в Docker, подключить
   оба контейнера к одной сети и указать её в `DOCKER_NETWORK`.
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
| `DOCKER_NETWORK` | `bridge`        |
| `APP_PORT`       | `3000`          |

Сборка и миграции выполняются до остановки старого контейнера. Перезапуск
создаёт короткую паузу в работе. Миграции должны быть совместимы со старой
версией приложения; автоматического отката БД нет.

`.dockerignore` исключает из контекста сборки локальные зависимости, сборку,
Git, `.env` и ключи. Конфигурация и секреты передаются только при запуске.
