# Логи приложения

Все контейнеры стека (реплики `api`, `worker`, `lb`, `postgres`, `redis` и др.) пишут
только в stdout. **Alloy** читает stdout через `/var/run/docker.sock`, **Loki** хранит
строки 30 дней, **Grafana** — единственное место, где их читают и ищут.

```text
stdout контейнеров ──► alloy ──► loki ◄── grafana (127.0.0.1:3200)
```

## Как найти запрос или ошибку

1. Открыть Grafana: `http://127.0.0.1:3200` (локально) или через туннель/поддомен
   (см. ниже). Логин `admin`, пароль из `GRAFANA_ADMIN_PASSWORD` в `.env` (обязателен: без него не
   стартует контейнер `grafana`, остальной стек работает). `.env` — единственный источник
   пароля: при каждом старте контейнер сбрасывает пароль `admin` на значение из `.env`.
   Сменить пароль: поправить `.env` и `docker compose up -d grafana`; смена через интерфейс
   Grafana откатится при следующем перезапуске. Анонимный доступ выключен.
2. Дашборд **«CRM — логи»** (готов сразу, настраивается provisioning-ом из
   `docker/grafana/provisioning/`).
3. Вставить `requestId` в поле **«Поиск»** — будут видны строки всех контейнеров, где он
   встречается: `lb` (access-лог), реплики `api` (сообщения сервисов и итог HTTP-запроса).
4. Фильтры: **«Контейнер»** (`service`: `api`, `worker`, `lb`, ...; все реплики API — это
   `service=api`, конкретную реплику показывает метка `container`, например `crm-core-api-3`, —
   она видна в деталях строки и на графике ошибок) и
   **«Уровень»** (`level`: `ERROR`, `WARN`, `INFO`, ...), оба с выбором нескольких значений.
   Строки без уровня (nginx, postgres, redis) получают `level=UNKNOWN`.
5. Панели: график числа ошибок (`ERROR|FATAL`) по времени, список логов по фильтрам и
   отдельный список «Только ошибки». Время показывается в часовом поясе браузера.

`requestId` намеренно **не** метка Loki (высокая кардинальность), поэтому он ищется
текстом. Метки три: `service` (из `com.docker.compose.service`, все реплики API — `api`),
`container` (имя контейнера, различает реплики) и `level` (из префикса строки `[...] LEVEL:`).

HTTP-ответы содержат заголовок `X-Request-Id`, доступный фронтенду через CORS.
Корректный входящий ID (до 64 букв, цифр, `_`, `-`, `.`) сохраняется; при отсутствии или
некорректном значении генерируется UUID. `lb` передаёт ID дальше, так что он сквозной.
ID служит для поиска, а не для идентификации пользователя. Контекст запроса автоматически
доступен существующим NestJS-логгерам сервисов. Cron-задачи и сообщения вне HTTP-запроса
пишутся без `requestId`.

Формат строки однострочный; stack trace продолжается на следующих строках, Alloy склеивает
их с записью выше (`stage.multiline`):

```text
[2026-11-04 12:42:10.123 UTC] WARN: [YandexOAuthStrategy] requestId=abc oauth failed: provider=yandex reason=EMAIL_MISSING_OR_INVALID
[2026-11-04 12:42:10.125 UTC] WARN: [HTTP] requestId=abc POST /auth/yandex status=401 duration=142ms
```

Ожидаемые отказы (OAuth без email, недоступный слот) пишутся как `WARN`, а не `ERROR`.

## Без Grafana

Compose сам сводит все контейнеры в один поток:

```bash
docker compose logs -f --timestamps api worker lb | grep <requestId>
```

Docker хранит для каждого контейнера до трёх файлов по 20 МБ (`max-size: 20m`,
`max-file: 3`), то есть это короткая история, а не архив; архив — Loki.

## Доступ к Grafana на сервере

Grafana слушает только `127.0.0.1:3200` и наружу не открывается. Два способа:

**SSH-туннель** (ничего не настраивать на сервере):

```bash
ssh -L 3200:127.0.0.1:3200 user@vps
# затем http://127.0.0.1:3200 на своей машине
```

**Поддомен на хостовом nginx** с TLS и `auth_basic` (второй замок поверх входа в Grafana):

```nginx
server {
  listen 443 ssl;
  server_name logs.example.com;
  # ssl_certificate / ssl_certificate_key — как у основного сайта

  auth_basic "logs";
  auth_basic_user_file /etc/nginx/.htpasswd-logs;   # htpasswd -c ... user

  location / {
    proxy_pass http://127.0.0.1:3200;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";   # live-режим Grafana (websocket)
  }
}
```

На сервере `GRAFANA_ADMIN_PASSWORD` — длинный случайный пароль.

## Хранение

- Loki: 30 дней (`limits_config.retention_period: 720h`, компактор с
  `retention_enabled`), том `loki-data`. Конфиг — `docker/loki/loki.yaml`.
- Сбор — `docker/alloy/config.alloy` (только контейнеры проекта `crm-core`).
  Том `alloy-data` хранит позиции чтения, поэтому после перезапуска Alloy строки не
  дублируются.
- Для всех сервисов в compose задан `mem_limit`.

## Логи в файлах — только локальный `npm run start:dev`

Без Docker приложение пишет файлы в `logs/` (`LOG_DIRECTORY=logs` по умолчанию):

- `app.log` — все сообщения; `errors.log` — только `ERROR` и `FATAL` со stack trace;
- `archive/` — предыдущие файлы в gzip. Время в файлах — **UTC**;
- ротация приложением: ежедневно в 00:00 UTC и при 20 МБ, до 14 архивов на файл; файлы
  `*.history` служебные.

В контейнерах compose `LOG_DIRECTORY` пустой: файлов нет, только stdout.

## Настройки

- `LOG_LEVEL=info` — также `trace`, `debug`, `warn`, `error`, `fatal`, `silent`.
- `LOG_DIRECTORY=logs` — локальная директория; пустое значение отключает файлы.
- `GRAFANA_ADMIN_PASSWORD` — пароль администратора Grafana (только compose).

HTTP-логгер не записывает заголовки, тела запросов и query-параметры. Ошибка выводится с
сообщением и stack trace, без дополнительных полей HTTP-клиента. В сообщениях сервисов
нельзя помещать пароли, OAuth-коды, токены или тела запросов: они попадают в Loki на 30 дней.
