# Метрики

Логи (`docs/logging.md`) отвечают на вопрос «что случилось с этим запросом», метрики — на
«как система себя чувствует и когда стало хуже». План целиком, включая ещё не сделанное
(метрики домена, алерты), — `docs/metrics-plan.md`.

```text
 api ×N ──:9464/metrics──┐
 worker ──:9464/metrics──┤
 postgres-exporter ──────┼──► prometheus (30 дней, ≤ 5 ГБ) ◄── grafana (127.0.0.1:3200)
 redis-exporter ─────────┘
```

## Где смотреть

Grafana (`http://127.0.0.1:3200`, доступ как к логам — `docs/logging.md`):

- **«Klendo — API»**: запросы в секунду, доля 4xx/5xx, p50/p95/p99, самые медленные,
  самые нагруженные и падающие маршруты, event loop, CPU, память и heap по репликам.
  Фильтры «Сервис» и «Контейнер» — те же метки, что в логах; из панелей ошибок ссылка ведёт в
  «Klendo — логи» с тем же интервалом.
- **«Klendo — инфраструктура»**: Postgres (соединения из `max_connections`, транзакции,
  попадание в кэш, блокировки, размер), Redis (память из `maxmemory`, команды, hit ratio,
  вытеснения, клиенты), число неотвечающих целей Prometheus.

Prometheus напрямую — `http://127.0.0.1:9090` (только для отладки запросов; `/targets` —
кого и как он собирает).

## Метрики приложения

Отдельный HTTP-сервер (`src/shared/metrics/`) на `METRICS_HOST:METRICS_PORT`, не основной
порт: `/metrics` не проходит через `lb`, гарды и лимиты и не публикуется наружу. Локально
(`start:dev`) — `http://127.0.0.1:9464/metrics`. `METRICS_PORT=0` выключает сервер; занятый
порт (второй `start:dev`) — ошибка в логе, приложение работает дальше.

| Метрика | Что |
| --- | --- |
| `http_server_request_duration_seconds` | histogram; `method`, `route`, `status_class` (`2xx`…`5xx`) |
| `http_server_requests_in_flight` | запросы в обработке |
| `process_*`, `nodejs_*` | CPU, память, heap, GC, задержка event loop (`prom-client` по умолчанию) |

`route` — шаблон маршрута (`/public/locations/:id/bookings`), никогда не реальный путь: id в
метках создавали бы новую серию на каждую сущность. Запросы, не дошедшие ни до одного
контроллера, — `route="unmatched"`. Ответы гардов (401, 403, 429) считаются под своим
маршрутом. Запросы, брошенные клиентом до ответа, в длительность не попадают.

Новая метрика: `new Counter({ ..., registers: [metricsService.registry] })` в модуле, который её
считает (для этого `MetricsModule` начинает экспортировать `MetricsService`). Только ограниченные
наборы значений в метках: никаких id, email, `requestId`.

## Как Prometheus находит процессы

`docker_sd_configs` через `/var/run/docker.sock` (как Alloy): контейнеры проекта с лейблами
`prometheus.scrape=true` и `prometheus.port` (якорь `x-app` в `compose.yaml`). Реплики при
смене `API_REPLICAS` и после `rollout.sh` подхватываются сами; метки `service` и `container`
совпадают с Loki. Конфиг — `docker/prometheus/prometheus.yml`; после правки
`docker compose restart prometheus`.

## Сервер

- `postgres-exporter` по умолчанию ходит в локальный `postgres`. На сервере задать
  `POSTGRES_EXPORTER_DSN` в `.env` — отдельная роль только для чтения статистики:

  ```sql
  CREATE ROLE monitor LOGIN PASSWORD '...';
  GRANT pg_monitor TO monitor;
  ```

  Без неё панели Postgres пустые, `pg_up = 0`; остальное работает.
- Память: Prometheus до 512 МБ, экспортеры по 64 МБ (`mem_limit`).
- Деплой (`prod-deploy.yml`) поднимает `prometheus` и экспортеры вместе с Loki и Grafana.
