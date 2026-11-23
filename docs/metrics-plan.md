# Метрики и алерты: Prometheus + Grafana (план)

Статус: план, не реализовано. Выполняется отдельной сессией.
Отклонение от решений раздела 1 — сначала правка этого документа.

Ветка: `feature/metrics`. Каждый шаг раздела 3 — отдельный коммит, после каждого
`npm run lint && npm run typecheck && npm test` зелёные.

## 0. Цель

Логи (Loki) отвечают на вопрос «что случилось с этим запросом». Метрики отвечают на «как
система себя чувствует и когда стало хуже», а алерты — «узнать о проблеме раньше клиентов».

Результат:

- скорость (p50/p95/p99) и доля ошибок по каждому эндпоинту, по всем репликам вместе и по каждой;
- здоровье процессов: CPU, память, задержка event loop, рестарты;
- узкие места: пул соединений Prisma, Postgres, Redis, очередь писем pg-boss, кэш, кроны;
- письмо на почту владельца, когда что-то сломалось, и письмо, когда починилось;
- серверные числа для нагрузочного теста (`docs/load-testing-plan.md`) и решения по L1-кэшу.

Чего это **не** решает: трассировку запросов (OpenTelemetry), аналитику бизнеса (воронки,
выручка), мониторинг снаружи (доступность сайта из интернета, TLS-сертификат) — раздел 5.

## 1. Решения коротко

| Вопрос | Решение |
| --- | --- |
| Сбор метрик | Prometheus (`prom/prometheus`, закреплённая версия) в том же compose, хранение 30 дней и не больше 5 ГБ |
| Метрики приложения | `prom-client`. Отдельный HTTP-сервер метрик на порту `9464` внутри контейнера, **не** через `lb` и не на основном порту — так `/metrics` никогда не попадёт в интернет и не требует авторизации |
| Как Prometheus находит реплики | `docker_sd_configs` через `/var/run/docker.sock` (как Alloy), фильтр по лейблам compose. Реплики `api` (любое `API_REPLICAS`) и `worker` подхватываются сами, в том числе после `rollout.sh` |
| Инфраструктура | `postgres_exporter`, `redis_exporter` — всегда. `node_exporter` (сервер: CPU, память, диск) и `cAdvisor` (контейнеры) — профиль `host-metrics`, включается на сервере через `COMPOSE_PROFILES` (на Docker Desktop для Windows они работают плохо) |
| Дашборды | Provisioning в Grafana, как «CRM — логи»: «CRM — API», «CRM — инфраструктура», «CRM — фоновые задачи» |
| Алерты | Встроенные алерты Grafana (unified alerting), без Alertmanager. Правила — provisioning в репозитории |
| Куда алерты | Email. Адрес — `ALERT_EMAIL` в `.env` (в репозиторий не попадает). SMTP — тот же, что у приложения (`SMTP_HOST`, `SMTP_PORT`, `EMAIL`, `EMAIL_PW`) |
| Алерты локально | Выключены, если `ALERT_EMAIL` пуст: entrypoint Grafana не подкладывает точку отправки (как с паролем). Правила видны и вычисляются, письма не уходят |
| Доступ | Prometheus не публикуется наружу (только `127.0.0.1:9090` для отладки). Смотреть — Grafana через тот же SSH-туннель (`docs/logging.md`) |
| Кардинальность | Метка маршрута — шаблон (`/public/locations/:id/bookings`), не реальный путь. Никаких `requestId`, id пользователей, email в метках |

## 2. Подробности

```
 api ×N ──:9464/metrics──┐
 worker ──:9464/metrics──┤
 postgres_exporter ──────┤
 redis_exporter ─────────┼──► prometheus (30 дней) ◄── grafana: дашборды + алерты ──► email
 node_exporter* ─────────┤                          ◄── loki (логи, уже есть)
 cadvisor* ──────────────┘    * профиль host-metrics (сервер)
```

### 2.1. Модуль метрик в приложении

`src/shared/metrics/` (одна сущность на файл, CLAUDE.md):

- `metrics.module.ts` — `@Global()`, экспортирует `MetricsService`. Импортируется в `AppModule`.
- `metrics.service.ts` — общий `Registry` из `prom-client`, `collectDefaultMetrics`
  (CPU, память, heap, GC, **задержка event loop**, открытые дескрипторы), метки по умолчанию
  `role` (`api`/`worker`/`all`). Отдельный `http.createServer` на `METRICS_PORT` (по умолчанию
  `9464`) в `onModuleInit`, закрывается в `onApplicationShutdown`. `METRICS_PORT=0` — сервер
  метрик выключен (тесты, второй `start:dev`).
- Регистрация метрик — в тех модулях, которые их считают (кэш, очередь, кроны), через
  `MetricsService`, а не глобальные переменные `prom-client`. В юнит-тестах — отдельный
  `Registry` на тест, чтобы метрики не протекали между тестами.

Порт `9464` не публикуется в compose; в `lb` его нет. `start:dev` слушает `127.0.0.1:9464`.

### 2.2. Какие метрики

Имена — по соглашениям Prometheus (`_seconds`, `_total`, `_bytes`), префикс `crm_` для своих.

| Метрика | Тип и метки | Откуда |
| --- | --- | --- |
| `http_server_request_duration_seconds` | histogram; `method`, `route` (шаблон), `status_class` (`2xx`…`5xx`) | express-middleware: `res.on('finish')`, маршрут из `req.baseUrl + req.route.path`; не сопоставленный маршрут → `route="unmatched"`. Ловит и ответы гардов (429, 401) |
| `http_server_requests_in_flight` | gauge | тот же middleware |
| `crm_db_pool_connections` | gauge; `state` (`total`/`idle`/`waiting`) | свой `pg.Pool` в `PrismaPg(pool)` (`DatabaseService`), значения читаются при опросе. `waiting > 0` — пул исчерпан |
| `crm_db_query_duration_seconds` | histogram; `operation` (`findMany`, `create`, …), `model` | Prisma `$extends` query-хук. Без текста запроса |
| `crm_job_queue_jobs` | gauge; `queue`, `state` (`created`/`active`/`retry`/`failed`) | `JobQueueService` → `getQueueStats` при опросе, только в роли `worker`/`all` (чтобы реплики не дублировали запросы к БД) |
| `crm_job_queue_oldest_waiting_seconds` | gauge; `queue` | возраст самой старой задачи в `created` |
| `crm_email_sent_total` | counter; `result` (`sent`/`failed`), `audience` | обработчик отправки писем |
| `crm_cron_runs_total` | counter; `job`, `result` (`success`/`error`/`skipped`) | `@ExclusiveCron` (обёртка уже есть) |
| `crm_cron_duration_seconds` | histogram; `job` | там же |
| `crm_cron_last_success_timestamp_seconds` | gauge; `job` | там же; основа алерта «крон не отработал» |
| `crm_cache_requests_total` | counter; `namespace`, `result` (`hit`/`miss`/`bypass`/`error`) | `AppCacheService` |
| `crm_cache_load_duration_seconds` | histogram; `namespace` | загрузка при промахе |
| `crm_state_store_available` | gauge 0/1 | `RedisService.available` (fail-open виден на графике) |
| `crm_bookings_created_total` | counter; `channel` (`public`/`cabinet`) | создание записи (одна бизнес-метрика для общего фона) |

Экспортеры дают: Postgres — соединения по состояниям, размер БД, блокировки, медленные запросы
(`pg_stat_statements` — включается в compose так же, как в плане нагрузочного теста); Redis —
память, команды/с, клиенты, `up`; node_exporter — CPU, память, **диск**, сеть сервера;
cAdvisor — CPU/память/рестарты каждого контейнера относительно `mem_limit`.

### 2.3. Prometheus

- `docker/prometheus/prometheus.yml`: `scrape_interval: 15s`; задания:
  - `app` — `docker_sd_configs` с фильтром `com.docker.compose.project=crm-core` и лейблом
    `prometheus.scrape=true`; порт из лейбла `prometheus.port`; метки `service`, `container`
    из лейблов compose (как в Alloy);
  - `postgres`, `redis`, `node`, `cadvisor` — статические адреса внутри сети.
- Лейблы `prometheus.scrape=true`, `prometheus.port=9464` — в якоре `x-app` (`api`, `worker`).
- Хранение: `--storage.tsdb.retention.time=30d --storage.tsdb.retention.size=5GB`, том
  `prometheus-data`; `mem_limit` 512m.
- `--web.enable-remote-write-receiver` — чтобы k6 мог писать метрики прогонов (план нагрузки).
- Порт `127.0.0.1:9090:9090` — только для отладки запросов.

**postgres_exporter на сервере.** БД там вне compose, адрес — `DOCKER_DATABASE_URL`. Экспортеру
нужен отдельный пользователь с ролью `pg_monitor` (только чтение статистики), строка — в
`.env` как `POSTGRES_EXPORTER_DSN`. Локально — тот же `postgres` из профиля `local`.

### 2.4. Дашборды

Provisioning в `docker/grafana/provisioning/dashboards/`, источник `Prometheus` добавляется
рядом с Loki. Все панели с переменной `container` (все реплики или одна).

1. **«CRM — API»**: RPS, доля 5xx и 4xx, p50/p95/p99 по маршрутам (топ-10 медленных), 429 от
   лимитеров, запросы в обработке, event loop lag, память и CPU по репликам, пул БД.
   Ссылка из панели ошибок в «CRM — логи» с тем же интервалом времени.
2. **«CRM — инфраструктура»**: Postgres (соединения из 100, топ запросов, размер), Redis
   (память из 256 МБ, доступность), сервер (CPU, память, **диск**), контейнеры (память
   относительно `mem_limit`, рестарты).
3. **«CRM — фоновые задачи»**: очередь писем (ожидают, возраст старейшей, ошибки), письма
   отправлено/ошибок, кроны (последний успешный запуск, длительность, ошибки), кэш (hit rate,
   промахи по namespace, ошибки хранилища).

### 2.5. Алерты

Grafana unified alerting, provisioning в `docker/grafana/provisioning/alerting/`:

- **Точка отправки** `email` на `$ALERT_EMAIL`. SMTP Grafana: `GF_SMTP_ENABLED=true`,
  `GF_SMTP_HOST=${SMTP_HOST}:${SMTP_PORT}`, `GF_SMTP_USER=${EMAIL}`, `GF_SMTP_PASSWORD=${EMAIL_PW}`,
  `GF_SMTP_FROM_ADDRESS=${EMAIL}`. Пустой `ALERT_EMAIL` — файл точки отправки не подкладывается.
- **Политика**: группировка по `alertname`, `group_wait 30s`, `group_interval 5m`,
  `repeat_interval 4h` (не спамить); письмо о восстановлении — да.
- **Важность**: метка `severity` = `critical` (сайт или запись не работают) или `warning`
  (деградация, починить в рабочее время). В теме письма — важность и название.

Правила (пороги стартовые, уточняются по месяцу реальных данных):

| Алерт | Условие | Важность |
| --- | --- | --- |
| API недоступен | ни одна реплика `api` не отвечает (`up == 0` для всех) 1 мин | critical |
| Реплика упала | `up == 0` у отдельной реплики 3 мин | warning |
| Много 5xx | доля 5xx > 2% за 5 мин при RPS > 0.2 | critical |
| Медленная онлайн-запись | p95 публичных маршрутов записи > 1 с 10 мин | warning |
| Event loop завис | p99 event loop lag > 0.5 с 5 мин | warning |
| Пул БД исчерпан | `crm_db_pool_connections{state="waiting"} > 0` 5 мин | warning |
| Postgres: соединения | > 80 из 100 10 мин | warning |
| Очередь писем копится | старейшее письмо ждёт > 10 мин | warning |
| Письма не уходят | доля `failed` > 20% за 15 мин | critical |
| Крон не отработал | `time() - crm_cron_last_success_timestamp_seconds` > 3× интервала (на каждый крон своё значение) | warning |
| Worker недоступен | `up == 0` у `worker` 5 мин | critical |
| Redis недоступен | `crm_state_store_available == 0` 5 мин (приложение работает без кэша и лимитов) | warning |
| Память контейнера | > 90% `mem_limit` 10 мин | warning |
| Диск сервера | свободно < 15% | warning; < 5% — critical |
| Логи не поступают | Loki: нет строк от `service="api"` 15 мин при живых репликах (защита от зависания Alloy, наблюдалось при проверке репликации) | warning |
| Бэкап не сделан | Loki: нет строки `[Backup] completed` от `service="backup"` больше 26 ч, или есть `ERROR` от `backup` (`docs/backups.md`) | critical |
| Prometheus не собирает | `up` любого задания == 0 15 мин | warning |

Проверка доставки: кнопка «Test» у точки отправки и один искусственный алерт (остановить
реплику) — письмо о проблеме и о восстановлении.

### 2.6. Конфигурация

`.env.example` (с комментариями):

```
# Metrics server inside the container (internal only). 0 disables it.
METRICS_PORT=9464
# Alert emails from Grafana. Empty: alerts are evaluated but not sent (local default).
ALERT_EMAIL=
# Docker Compose on the server: postgres_exporter connection (role pg_monitor).
# POSTGRES_EXPORTER_DSN=postgresql://monitor:password@host:5432/booking-crm?sslmode=disable
# Server only: host and container metrics.
# COMPOSE_PROFILES=host-metrics
```

Деплой (`prod-deploy.yml`): `prometheus` и экспортеры добавляются в шаг
`up -d --no-deps redis loki alloy grafana lb ...`.

Память на VPS (ориентир): Prometheus ~250 МБ, экспортеры ~30 МБ каждый, cAdvisor ~100 МБ.
Всем — `mem_limit`.

## 3. Порядок работы (коммиты)

1. `prom-client`, `MetricsModule`/`MetricsService`, сервер метрик на `METRICS_PORT`, метрики по
   умолчанию, HTTP-middleware (`route` — шаблон) + тесты (маршрут-шаблон, `unmatched`, 4xx/5xx,
   изоляция `Registry`).
2. Метрики домена: пул БД (свой `pg.Pool` в `PrismaPg`), длительность запросов Prisma, очередь
   pg-boss, письма, кроны в `@ExclusiveCron`, кэш, доступность хранилища, созданные записи.
   Тесты на каждую.
3. Prometheus и экспортеры в compose (`host-metrics` профиль), лейблы `prometheus.*` в `x-app`,
   `prometheus.yml` с `docker_sd`. Проверка: все цели `UP` в `127.0.0.1:9090/targets`, при
   `API_REPLICAS=3` видны три реплики, после `rollout.sh` — новые.
4. Источник данных Prometheus и три дашборда в Grafana.
5. Алерты: SMTP Grafana, точка отправки из `ALERT_EMAIL`, политика, правила 2.5. Проверка
   тестовым письмом и остановкой реплики.
6. Деплой (`prod-deploy.yml`), `.env.example`, `docs/metrics.md` (что где смотреть, что делать
   по каждому алерту — короткий runbook), `docs/deployment.md` (пользователь `pg_monitor`,
   `COMPOSE_PROFILES`), `README.md`; ссылки из `docs/load-testing-plan.md` и раздела 5
   `docs/replication-plan.md`.

## 4. Проверка (обязательно руками, не только тестами)

Локально, `docker compose --profile local up -d --build`:

- [ ] `127.0.0.1:9090/targets`: `api` (каждая реплика), `worker`, `postgres`, `redis` — `UP`.
- [ ] `/metrics` недоступен через `lb` (`curl 127.0.0.1:3000/metrics` → 404) и снаружи.
- [ ] Маршруты в метриках — шаблоны, а не реальные id; число серий `http_server_*` не растёт
  от запросов с разными id.
- [ ] `rollout.sh api` и смена `API_REPLICAS`: старые цели исчезают, новые появляются сами.
- [ ] Дашборды показывают данные; панель ошибок ведёт в логи с тем же временем.
- [ ] `docker compose stop redis` → `crm_state_store_available` = 0, через 5 мин алерт
  «Redis недоступен» в состоянии `Firing`.
- [ ] С `ALERT_EMAIL` в `.env`: тестовое письмо дошло; остановка всех реплик `api` → письмо
  `critical` через ~1–2 мин и письмо о восстановлении после старта.
- [ ] С пустым `ALERT_EMAIL`: алерты вычисляются, писем нет, Grafana стартует без ошибок.
- [ ] Пул БД: при нагрузке (`autocannon` на тяжёлый эндпоинт) видно `idle`/`waiting`.
- [ ] Крон: `crm_cron_last_success_timestamp_seconds` обновляется у ежеминутных кронов; в
  `api` (роль `api`) серий кронов нет.
- [ ] `npm run start:dev` работает, метрики на `127.0.0.1:9464/metrics`; второй экземпляр с
  `METRICS_PORT=0` стартует без конфликта порта.

## 5. Вне задачи

- Трассировка запросов (OpenTelemetry → Tempo) — когда понадобится разбирать медленные запросы
  по шагам.
- Мониторинг снаружи: доступность сайта из интернета и срок TLS-сертификата
  (blackbox_exporter с другой машины или внешний сервис) — алерты выше не сработают, если упал
  весь VPS.
- Метрики nginx (`lb`, хостовый) — пока хватает HTTP-метрик приложения.
- Бизнес-аналитика (воронка записи, выручка) — не в Prometheus.
- Алерты в Telegram или другие каналы — добавляются второй точкой отправки без изменения правил.
- Долгое хранение метрик (больше 30 дней), отдельный сервер мониторинга.
