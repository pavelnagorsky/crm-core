# Реплики приложения, Redis и единые логи (план)

Статус: не начато. Документ рассчитан на выполнение в отдельной сессии от начала до конца.
Отклонение от решений раздела 1 — сначала правка этого документа.

Ветка: `feature/replication`. Каждый шаг раздела 3 — отдельный коммит, после каждого
`npm run lint && npm run typecheck && npm test` зелёные.

## 0. Цель

Онлайн-запись не должна останавливаться, если упал или завис один процесс, и во время деплоя.
Всё работает на одном VPS в Docker. Хостинга пока нет: стек должен полностью подниматься
локально одной командой (`docker compose --profile local up -d --build`), а на сервере
отличаться только `.env`.

Чего это **не** решает (и не надо пытаться в рамках задачи): падение самого VPS, Postgres,
переполнение диска. По нагрузке реплики почти ничего не дают: ожидаемый пик — десятки RPS,
один процесс держит сотни. Задача — отказоустойчивость, а не производительность.

## 1. Решения коротко

| Вопрос | Решение |
| --- | --- |
| Как запускать несколько процессов | Docker Compose, отдельные сервисы `api-1`, `api-2`, `worker` из одного образа. PM2 не используем (два супервизора друг над другом) |
| Балансировщик | Контейнер `lb` (nginx) внутри compose, слушает `127.0.0.1:3000`. Внешний nginx/ispmanager на хосте (TLS, `limit_req`) как и раньше проксирует на `127.0.0.1:3000` — его конфиг не меняется |
| Кроны | Переменная `APP_ROLE`: `api` — без кронов, `worker` — с кронами, `all` (по умолчанию, локальный `start:dev`) — всё. Плюс страховочная блокировка запуска в Redis |
| Очередь писем pg-boss | Без изменений, обработчики работают во всех ролях (pg-boss безопасен при нескольких процессах) |
| Кэш | Redis вместо памяти процесса. Модель тегов (`dependencies`, `invalidate`) и все `defineCache`/вызовы в модулях не меняются — меняется только `AppCacheService` и хранилище |
| Rate limiting | `ThrottlerModule` и `PublicBookingRateLimiter` хранят счётчики в Redis |
| Redis недоступен | Ничего не падает (fail-open): кэш читает из БД, лимиты пропускают, кроны запускаются. `/health` от Redis **не** зависит — иначе упадут все реплики разом |
| Redis библиотека | `ioredis`. `cache-manager`, `@nestjs/cache-manager` удалить |
| Логи | Все контейнеры пишут в stdout. **Grafana + Loki + Alloy** собирают их в одно место: веб-интерфейс, поиск по `requestId`, фильтр по уровню и контейнеру, хранение 30 дней. Подробно — раздел 2.6 |
| Пулы соединений с БД | Размер пула Prisma из `DATABASE_POOL_SIZE` (по умолчанию 10). pg-boss — 3, как сейчас |
| Postgres | Локально — сервис `postgres` в compose (профиль `local`). На сервере — где угодно, адрес из `DOCKER_DATABASE_URL` |

## 2. Архитектура

```
                 host nginx / ispmanager (TLS, limit_req)
                              │  127.0.0.1:3000
                        ┌─────▼─────┐
                        │  lb nginx │  passive health, retry
                        └──┬─────┬──┘
                    ┌──────▼┐   ┌▼──────┐   ┌────────┐
                    │ api-1 │   │ api-2 │   │ worker │  APP_ROLE=worker: кроны
                    └──┬──┬─┘   └─┬──┬──┘   └─┬──┬───┘
                       │  └───────┼──┼────────┘  │
                  ┌────▼──────────▼┐ │     ┌─────▼────┐
                  │    postgres    │ └─────►  redis   │  кэш, лимиты, блокировки кронов
                  └────────────────┘       └──────────┘
   stdout всех контейнеров ──► alloy ──► loki ◄── grafana (127.0.0.1:3200)
```

### 2.1. Redis

- `src/shared/redis/redis.module.ts` — `@Global()` (как `DatabaseModule`), импортируется один раз
  в `AppModule`, экспортирует `RedisService`.
- `src/shared/redis/redis.service.ts`:
  - `ioredis` из `REDIS_URL`. Опции для fail-open: `enableOfflineQueue: false`,
    `maxRetriesPerRequest: 1`, `connectTimeout: 2000`, `commandTimeout: 500`. Переподключение —
    встроенное в ioredis.
  - `get available(): boolean` — `client.status === 'ready'`.
  - Логирование только смены состояния (подключился / потерял соединение), не каждой ошибки.
    Обязательно подписка на `'error'`, иначе ioredis пишет в stderr без конца.
  - Старт приложения **не** падает, если Redis недоступен.
  - `eval`-хелпер для Lua-скриптов: `EVALSHA`, при `NOSCRIPT` — `EVAL`.
  - `onApplicationShutdown` — `quit()`.
- `REDIS_URL` обязателен при `NODE_ENV=production` (ошибка конфигурации на старте),
  в остальных окружениях без него — предупреждение и работа без Redis (всё в fail-open).
- Префикс ключей задаётся вручную (`crm:`), **не** опцией `keyPrefix` ioredis: внутри Lua ключи
  тегов собираются из строк, и `keyPrefix` их не префиксует.
- Конфиг Redis (в compose): `maxmemory 256mb`, `maxmemory-policy volatile-lru`, без
  персистентности (`--save "" --appendonly no`). Почему `volatile-lru` — раздел 2.2.

### 2.2. Кэш на Redis

Модель та же, что сейчас (глобальная ревизия + ревизия тега), только счётчики живут в Redis
и общие для всех реплик.

Ключи:

| Ключ | Что | TTL |
| --- | --- | --- |
| `crm:cache:rev` | глобальный счётчик ревизий | нет |
| `crm:cache:tag:<dependency>` | ревизия последнего сброса тега | нет |
| `crm:cache:entry:<namespace:identity>` | hash `{ r: ревизия загрузки, d: зависимости через \n, v: значение }` | `policy.ttlMs` |

Почему у тегов и счётчика нет TTL: при `volatile-lru` вытесняются только ключи с TTL, то есть
записи кэша. Если бы вытеснился тег, а запись осталась, устаревшее значение считалось бы
свежим. Тегов мало (сущности × виды), память копеечная.

Три Lua-скрипта (атомарность обязательна):

1. **read** (`KEYS[1]` = entry, `KEYS[2]` = rev; `ARGV[1]` = префикс тегов): `HMGET r d v`.
   Нет записи → вернуть `{current}`.
   Есть: если `r > current` (Redis перезапускался) или любой тег из `d` > `r` → `DEL`,
   вернуть `{current}`. Иначе вернуть `{current, v, PTTL}`.
   `current` = `GET crm:cache:rev` — это ревизия, которую вызывающий запомнит перед загрузкой.
2. **write** (`KEYS[1]` = entry, `KEYS[2]` = rev; ARGV: префикс тегов, ревизия, зависимости,
   значение, ttl): если `ревизия > current` или любой тег > ревизии → вернуть 0 (не писать).
   Иначе `DEL` + `HSET r d v` + `PEXPIRE`, вернуть 1. Так закрыта гонка «сброс случился между
   загрузкой и записью».
3. **invalidate** (`KEYS[1]` = rev, `KEYS[2]` = tag): `r = INCR rev; SET tag r`.

Ключи тегов в read/write зависят от содержимого записи и заранее не известны, поэтому
собираются внутри скрипта как `ARGV[1]` (`crm:cache:tag:`) + зависимость; все остальные ключи
приходят через `KEYS`. Это допустимо только для одиночного Redis (не кластер).

Файлы (одна сущность на файл, см. CLAUDE.md):

- `src/shared/cache/interfaces/cache-store.interface.ts` — `read(key)`, `write(...)`,
  `invalidate(dependency)`, `available`.
- `src/shared/cache/interfaces/cache-read-result.interface.ts` — `{ revision: number;
  payload?: string; ttlMs?: number }` (hit, если есть `payload`).
- `src/shared/cache/cache-store.token.ts` — DI-токен `CACHE_STORE`.
- `src/shared/cache/redis-cache.store.ts` — реализация на `RedisService` и скриптах.
- `src/shared/cache/redis-cache.scripts.ts` — тексты трёх Lua-скриптов.
- `src/shared/cache/testing/memory-cache.store.ts` — та же семантика в памяти, только для
  тестов. Время — через `Date.now()`, чтобы работали `vi.useFakeTimers()`.
- `src/shared/cache/cache-value.codec.ts` — `encode`/`decode` в JSON с сохранением типов:
  `Date`, `Prisma.Decimal`, `BigInt` (теговые объекты, например `{ "__cache:date": iso }`).
  После `decode` объекты новые, отдельный `cloneCacheValue` на чтении из Redis не нужен.
- `src/shared/cache/interfaces/memory-cache-entry.interface.ts` — запись `MemoryCacheStore`;
  `src/shared/cache/interfaces/pending-cache-load.interface.ts` — `{ revision, promise }` для
  склейки загрузок. `interfaces/cache-entry.interface.ts` больше не нужен — удалён.

Кэш переживает деплой, старая и новая версии кода читают одни записи. Поэтому при смене формы
кэшируемого значения меняется значение пространства в `CacheNamespace` (например, суффикс
`.v2`) — правило записано в `README.md`.

`AppCacheService` (`getOrLoad`, `invalidate`, `enabled` — публичный API **не меняется**):

1. `!enabled` или `!store.available` → `loader()` без кэша.
2. `read`. Ошибка Redis → предупреждение (не чаще раза в минуту) и `loader()`.
3. Hit: `decode`. Если `definition.isUsable` вернул false (используется в
   `STAFF_SCHEDULE_CACHE`) — как промах. Если `ttlMs <= policy.refreshAheadMs` — фоновое
   обновление (раздел ниже), а текущее значение отдать сразу.
4. Промах: загрузка с ревизией `current` из ответа `read`:
   - `value = await loader()`, `deps = definition.dependencies(context, value)`,
     `write(...)`. Записалось → вернуть `value`.
   - Не записалось (сброс во время загрузки) → одна повторная загрузка с новой ревизией
     (или присоединение к уже идущей загрузке этого процесса с ревизией не ниже новой).
     Опять не записалось → третье чтение из БД без кэширования, как и было до Redis
     («A second concurrent change should not keep the request in a retry loop»). Второе
     значение не отдаём: его загрузку пересекла инвалидация, а тест
     `reloads once, then reads without caching…` ожидает именно третье чтение.
   - Ошибка Redis при записи → предупреждение, значение отдаётся без кэширования.
   - Ошибка `loader` пробрасывается и не кэшируется.
5. Склейка одновременных загрузок в процессе: `Map<key, { revision, promise }>`.
   Присоединяться к идущей загрузке можно, только если её `revision >= current` — иначе
   запрос, пришедший после сброса, получит старые данные. Каждому вызывающему отдаётся
   `cloneCacheValue` результата (объект общий).
6. Фоновое обновление — та же загрузка через ту же `Map`; ошибки только в лог
   (`Cache refresh failed: <key>`), старое значение остаётся до конца TTL.
7. `invalidate`: ошибка Redis → `logger.error` (данные в БД уже закоммичены, запрос не валим).
   Устаревание ограничено TTL. `!store.available` → предупреждение (с тем же ограничением
   раз в минуту) и пропуск.
8. `onModuleDestroy` больше **не** чистит кэш (он общий для реплик), только перестаёт
   запускать фоновые обновления.

Политики: `CATALOG_CACHE_POLICY` (сейчас 24 ч) уменьшить до `ttlMs: 60 мин`,
`refreshAheadMs: 10 мин`. Причина: с Redis появилось окно «коммит прошёл, процесс упал до
`invalidate`» — TTL теперь единственная страховка. `BILLING_CACHE_POLICY` — без изменений,
комментарий про реплики обновить.

`AppCacheModule`: `providers: [AppCacheService, { provide: CACHE_STORE, useClass: RedisCacheStore }]`,
`CacheModule.register()` убрать. `createTestCache(enabled)` → `new AppCacheService(new MemoryCacheStore(), config)`;
сигнатура не меняется, доменные тесты (`booking-cache-invalidation.spec.ts`,
`staff-schedule-cache.spec.ts`, `products.service.spec.ts` и др.) должны пройти без правок.

`app-cache.service.spec.ts` переписать под `MemoryCacheStore`, сохранив **все сценарии**
текущих тестов (гонки сброса во время загрузки, во время записи, фоновое обновление после
сброса, склейка загрузок, отключённый кэш, Date/Decimal). Тесты, завязанные на внутренности
`cache-manager` (`store.serializeData`, событие `refresh`), заменить эквивалентными через
`MemoryCacheStore`. Добавить: fail-open при ошибке хранилища, кодек (Date/Decimal/BigInt).

Lua-скрипты проверить интеграционным тестом против настоящего Redis:
`src/shared/cache/redis-cache.store.e2e-spec.ts` (запускается `npm run test:e2e`, пропускается
через `describe.skipIf(!process.env.REDIS_URL)`).

### 2.3. Rate limiting на Redis

**ThrottlerModule.** Своё хранилище `src/shared/redis/redis-throttler.storage.ts`, реализует
`ThrottlerStorage` из `@nestjs/throttler` (`increment(key, ttl, limit, blockDuration, throttlerName)`).
Готовый `@nest-lab/throttler-storage-redis` не берём: нужен fail-open и нет лишней зависимости.

- Lua: если есть ключ блокировки → вернуть заблокировано; иначе `INCR` + `PEXPIRE` на первом
  хите; если `hits > limit` и `blockDuration > 0` → поставить ключ блокировки (и сбросить
  счётчик — как встроенное хранилище обнуляет хиты после блокировки); при `blockDuration = 0`
  хит сверх лимита отклоняется и не считается (`DECR`), как во встроенном.
- `RedisThrottlerStorage` — провайдер глобального `RedisModule` (и в его `exports`), чтобы
  `forRootAsync` мог его внедрить.
- Единицы `timeToExpire`/`timeToBlockExpire` взять **точно** как во встроенном
  `ThrottlerStorageService` (`node_modules/@nestjs/throttler/dist/throttler.service.js`) — от
  них зависят заголовки `Retry-After`.
- Ошибка Redis → `{ totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }`.
- `ThrottlerModule.forRoot(throttlerConfig)` → `forRootAsync` с `inject: [RedisThrottlerStorage]`
  и `storage` в опциях. Декораторы `@StrictRateLimit` и т.п. не меняются.
- `docs/rate-limiting.md`: убрать «Счётчики хранятся в памяти процесса…», описать Redis.

**PublicBookingRateLimiter** (`src/modules/bookings/services/public-booking-rate-limiter.ts`).
Скользящее окно на sorted set, поведение как сейчас (при превышении хит не добавляется,
лимиты и окно те же):
`ZREMRANGEBYSCORE key 0 now-window` → `ZCARD` → если `>= limit` вернуть 0 → иначе
`ZADD now <uuid>` + `PEXPIRE window` → 1. Ошибка Redis → пропустить (fail-open).
Метод становится `async` — обновить вызывающих. Тесты — на мок `RedisService`.

### 2.4. Роли и кроны

`APP_ROLE`: `all` (по умолчанию) | `api` | `worker`. Значение в `configuration.ts`
(`app.role`), enum `AppRole` в `src/shared/enums/app-role.enum.ts`.

- `ScheduleModule.forRoot()` подключается в `AppModule` только при `all`/`worker`. Без него
  декораторы `@Cron` — просто метаданные, ничего не запускается. Читать `process.env.APP_ROLE`
  на уровне модуля можно: `main.ts` импортирует `dotenv/config` раньше `AppModule`.
- HTTP слушают все роли (нужен `/health`), но в `lb` прописаны только `api-1`, `api-2`.
- Обработчики pg-boss — во всех ролях, без изменений.

**Блокировка запуска** — страховка, если по ошибке окажется два процесса с кронами
(например, `APP_ROLE` не задан на api).

- Декоратор `@ExclusiveCron(expression)` в `src/shared/cron/decorators/exclusive-cron.decorator.ts`
  заменяет `@Cron(expression)` во всех 12 местах (список ниже). Внутри: оборачивает метод,
  затем применяет `Cron(expression)` к обёртке (порядок важен — метаданные `@Cron`
  вешаются на функцию). Аргументы метода пробрасываются (`expireDue(now = new Date())` и
  подобные вызываются тестами напрямую).
- Имя блокировки — `ClassName.methodName`, слот — минута запуска:
  `SET crm:cron:<name>:<floor(now / 60000)> <instance> NX EX 3600`. Не получили → пропустить
  запуск с `debug`-логом.
- Ошибка Redis → **запустить** (роли уже гарантируют один worker; пропущенное напоминание хуже).
- Сервис `src/shared/cron/cron-lock.service.ts` (зависит от `RedisService`). Декоратор не имеет
  DI, поэтому сервис в `onModuleInit` регистрирует себя в статическом поле; если не
  зарегистрирован (юнит-тесты) — метод выполняется без блокировки.
- В коде самих кронов ничего не менять.

Кроны:

| Файл | Метод | Расписание |
| --- | --- | --- |
| `auth/services/auth-cleanup.service.ts` | `cleanExpiredRefreshTokens` | 03:00 |
| `billing/jobs/services/subscription-notices.cron.ts` | `sendNotices` | каждые 15 мин |
| `billing/jobs/services/subscription-payments.cron.ts` | `expireDue` | `0 5 * * * *` |
| `booking-traffic/services/booking-traffic.service.ts` | `purgeExpiredStats` | 1-го числа 04:40 |
| `bookings/services/booking-cron.service.ts` | `sendReminders` | каждые 15 мин |
| | `sendReviewRequests` | каждый час |
| | `sendClientNotices` | каждую минуту |
| | `purgeClickIds` | 04:00 |
| | `completeElapsed` | каждые 10 мин |
| `files/services/private-file-cleanup.service.ts` | `purgeUnattached` | каждый час |
| `notifications/services/email-outbox.service.ts` | `dispatchOrphans` | каждую минуту |
| | `purgeOld` | 04:00 |

### 2.5. Пулы соединений

- `DatabaseService`: `new PrismaPg({ connectionString, max: DATABASE_POOL_SIZE })`, значение
  через `configuration.ts` (`database.poolSize`, по умолчанию 10).
- Итог: `(2 api + 1 worker) × (10 Prisma + 3 pg-boss) = 39` соединений + миграции. Стандартный
  `max_connections = 100` — с запасом. Формулу записать в `docs/deployment.md`.

### 2.6. Логи: одно место для всех контейнеров

Требование пользователя: искать и читать **в одном месте**, удобно и понятно.

Решение: **Grafana + Loki + Alloy** в том же compose.

- Приложение в Docker пишет только в stdout: в compose **не** задавать `LOG_DIRECTORY` —
  `readable-log.transport.ts` уже поддерживает работу без файлов. Код транспорта не менять.
  Локальный `npm run start:dev` пишет файлы в `logs/`, как раньше.
- Формат строки прежний и однострочный (`singleLine: true`):
  `[2026-11-04 12:42:10.123 UTC] WARN: [Context] requestId=abc ...`.
- **Alloy** (`grafana/alloy`) читает stdout контейнеров через `/var/run/docker.sock`:
  `discovery.docker` с фильтром по лейблу `com.docker.compose.project=crm-core`, метка
  `service` из `com.docker.compose.service` (`api-1`, `api-2`, `worker`, `lb`), `stage.regex`
  `^\[[^\]]+\] (?P<level>[A-Z]+):` → метка `level`. `requestId` меткой **не** делать
  (высокая кардинальность) — ищется текстом.
- **Loki** (`grafana/loki`, single binary, filesystem, schema v13/tsdb): хранение 30 дней
  (`limits_config.retention_period: 720h`, `compactor.retention_enabled: true`), том `loki-data`.
- **Grafana** (`grafana/grafana`) на `127.0.0.1:3200`, пароль администратора из
  `GRAFANA_ADMIN_PASSWORD`, анонимный доступ выключен. Через provisioning
  (`docker/grafana/provisioning/...`) сразу настроены:
  - источник данных Loki;
  - дашборд **«CRM — логи»**: переменные `Контейнер` (multi, по умолчанию все), `Уровень`
    (multi), текстовое поле `Поиск` (requestId или любой текст). Панели: график количества
    ошибок (`ERROR|FATAL`) по времени, список логов
    `{service=~"$service", level=~"$level"} |= "$search"`, отдельный список «Только ошибки».
  - Время в Grafana показывается в часовом поясе браузера — проблема «в файлах UTC»
    из `docs/logging.md` уходит.
- Резервный способ без Grafana: `docker compose logs -f --timestamps api-1 api-2 worker | grep <requestId>` —
  compose сам сводит все контейнеры в один поток. Лимит docker json-file оставить
  (`max-size: 20m`, `max-file: 3` на контейнер).
- На сервере Grafana наружу не открывать: SSH-туннель (`ssh -L 3200:127.0.0.1:3200 vps`)
  или поддомен на хостовом nginx с TLS и `auth_basic`. Описать оба варианта.
- `docs/logging.md` переписать: «открыть Grafana → дашборд «CRM — логи» → вставить requestId
  в «Поиск»». Раздел про ispmanager/файлы оставить только для локального `start:dev`.

Ресурсы на VPS (ориентир): Loki ~150 МБ, Grafana ~100 МБ, Alloy ~60 МБ, Redis до 256 МБ,
каждый Node-процесс ~200–300 МБ. Всем сервисам задать `mem_limit`, чтобы ни один не вытеснил
Postgres через OOM-killer.

### 2.7. Docker Compose

Файлы:

- `compose.yaml` в корне, `name: crm-core`.
- `docker/nginx/lb.conf` — конфиг балансировщика.
- `docker/loki/loki.yaml`, `docker/alloy/config.alloy`, `docker/grafana/provisioning/**`.

Сервисы:

| Сервис | Образ | Заметки |
| --- | --- | --- |
| `postgres` | `postgres:17-alpine` | `profiles: [local]`, порт `127.0.0.1:5433:5432` (5432 часто занят локальным Postgres), том, healthcheck `pg_isready` |
| `redis` | `redis:7.4-alpine` | флаги из 2.1, порт `127.0.0.1:6379:6379` (для `start:dev`), healthcheck `redis-cli ping` |
| `migrate` | target `migrate` из Dockerfile | одноразовый; `depends_on: postgres` с `required: false` (на сервере Postgres вне compose) |
| `api-1`, `api-2` | target `runtime` | общий YAML-якорь `x-app`; `APP_ROLE=api`; `depends_on: migrate (service_completed_successfully)`, `redis`; `stop_grace_period: 30s`; `init: true`; монтирование `secrets/` как в текущем workflow |
| `worker` | тот же образ | `APP_ROLE=worker`, порт наружу не публикуется |
| `lb` | `nginx:1.28-alpine` | `127.0.0.1:${APP_PORT:-3000}:80` |
| `loki`, `alloy`, `grafana` | см. 2.6 | |

Переменные контейнеров приложения: `env_file: .env`, затем переопределения
`DATABASE_URL: ${DOCKER_DATABASE_URL:-postgresql://crm:crm@postgres:5432/crm}`,
`REDIS_URL: redis://redis:6379`, `DATABASE_POOL_SIZE`, `APP_ROLE`. Так один и тот же `.env`
работает и для `start:dev` (там `localhost`), и для compose.

Образ собирается один раз: `build` (target `runtime`) только у `api-1`, у всех трёх
`image: crm-core:${IMAGE_TAG:-local}`.

**lb.conf** — важные детали:

- `upstream` с `zone` и `server api-1:3000 resolve; server api-2:3000 resolve;` плюс
  `resolver 127.0.0.11 valid=5s;`. Без `resolve` nginx запомнит IP при старте, и после
  пересоздания контейнера при деплое будет слать запросы в никуда (параметр `resolve` в
  open-source nginx — с 1.27.3; если не взлетит — фиксированные `ipv4_address` в сети compose).
- `max_fails=1 fail_timeout=5s`, `proxy_next_upstream error timeout http_502 http_503`,
  `proxy_next_upstream_tries 2`. POST повторно не отправляется, если запрос уже дошёл до
  упавшего экземпляра (поведение nginx по умолчанию), — запись не создастся дважды.
- Передавать `Host`, `X-Forwarded-For $proxy_add_x_forwarded_for`, `X-Forwarded-Proto`
  (взять из входящего `X-Forwarded-Proto`, если есть, иначе `$scheme`),
  `X-Request-Id`. `client_max_body_size 30m` (импорт отзывов 25 МБ).
- IP клиента: цепочка «host nginx → lb → api». Адреса docker-сети приватные, и
  `TRUST_PROXY` по умолчанию (`loopback, linklocal, uniquelocal`) им доверяет — проверить
  руками, что `req.ip` в логах = реальный IP, а не адрес `lb`.
- Access-лог lb в stdout (попадает в Loki как `service=lb`).

### 2.8. Деплой

`.github/workflows/prod-deploy.yml` переписать на compose (серверных секретов ещё нет —
главное, чтобы скрипт был готов). Последовательность на VPS:

1. `git checkout --detach $DEPLOY_SHA`, `export IMAGE_TAG=$DEPLOY_SHA`.
2. `docker compose build` и сборка образа `migrate`.
3. `docker compose run --rm --no-deps migrate`.
4. `docker compose up -d --no-deps redis loki alloy grafana lb` (не пересоздаёт неизменённые).
5. Поочерёдно: `docker compose up -d --no-deps --wait api-1`, затем `api-2`, затем `worker`.
   `--wait` ждёт `healthy` (healthcheck уже есть в Dockerfile). Пока перезапускается один
   api, lb отдаёт трафик второму.
6. При неудаче `--wait` — `docker compose logs --tail 100 <сервис>` и `exit 1`.

Миграции обязаны быть совместимы со старой версией кода (несколько минут работают обе) —
это уже записано в `docs/deployment.md`, усилить формулировку.

### 2.9. Переменные окружения

Добавить в `.env.example` с комментариями:

```
# Redis: cache, rate limits, cron locks. Required in production.
REDIS_URL=redis://localhost:6379
# api | worker | all. Crons run only in worker/all.
APP_ROLE=all
DATABASE_POOL_SIZE=10
# Docker Compose only: database address as seen from containers.
# DOCKER_DATABASE_URL=postgresql://user:password@host:5432/booking-crm
# GRAFANA_ADMIN_PASSWORD=change_me
# APP_PORT=3000
```

`CACHE_ENABLED` оставить (комментарий: кэш в Redis, не в памяти).

## 3. Порядок работы (коммиты)

1. `ioredis`, `RedisModule`/`RedisService`, конфиг, `.env.example`; `compose.yaml` пока с
   `postgres` и `redis` — чтобы сразу проверять локально.
2. Кэш на Redis (2.2) + тесты; удалить `cache-manager`, `@nestjs/cache-manager`.
3. Throttler storage и `PublicBookingRateLimiter` на Redis (2.3) + тесты + `docs/rate-limiting.md`.
4. `APP_ROLE`, `@ExclusiveCron`, `CronLockService`, замена 12 декораторов (2.4) + тесты.
5. `DATABASE_POOL_SIZE` (2.5).
6. Полный compose: `migrate`, `api-1`, `api-2`, `worker`, `lb` (2.7).
7. Loki, Alloy, Grafana с провижинингом и дашбордом (2.6), `docs/logging.md`.
8. Workflow деплоя (2.8), `docs/deployment.md`, `README.md` (как поднять стек локально).

## 4. Проверка (обязательно руками, не только тестами)

Локально, `docker compose --profile local up -d --build`:

- [ ] `curl 127.0.0.1:3000/health` → 200; в логах видно, что запросы распределяются между `api-1` и `api-2`.
- [ ] `docker compose stop api-1` → запросы продолжают проходить без ошибок; `start` — возвращается в ротацию.
- [ ] `docker compose stop redis` → приложение отвечает, кэш/лимиты в fail-open, в логе одно предупреждение, а не поток; `start` — переподключение само.
- [ ] Изменить настройки филиала через `api-1`, сразу прочитать через `api-2` → новое значение (кэш общий).
- [ ] Лимит `@StrictRateLimit` на `/auth/*` срабатывает суммарно по обоим api, а не ×2.
- [ ] Кроны: в логах `worker` есть запуски, в `api-1/api-2` — нет. Временно запустить `api-1` с `APP_ROLE=all` → каждый крон в минуту выполнился один раз (второй пропущен блокировкой).
- [ ] Grafana `127.0.0.1:3200` → дашборд «CRM — логи» → поиск по `requestId` из заголовка `X-Request-Id` находит строки из нужного контейнера; фильтр по уровню работает; время в местном поясе.
- [ ] Поочерёдный перезапуск (`up -d --no-deps --wait api-1`, потом `api-2`) под нагрузкой (`npx autocannon -d 30 http://127.0.0.1:3000/health`) — без 5xx.
- [ ] `req.ip` в логах — реальный адрес клиента, а не `lb`.
- [ ] `npm run start:dev` без Docker-стека продолжает работать (только с предупреждением про Redis).

## 5. Вне задачи

- Отдельный L1-кэш в памяти поверх Redis (добавить, если профилирование покажет необходимость).
- Redis Sentinel/кластер, реплики Postgres, второй VPS.
- Метрики (Prometheus) и алерты — Grafana уже будет, это следующий естественный шаг.
- Нагрузочное тестирование бизнес-эндпоинтов (k6) — отдельной задачей после запуска стека.
