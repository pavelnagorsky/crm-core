# Rate limiting и защита от DDoS

Защита в три слоя. Приложение — последний слой: от объёмной атаки оно не спасёт,
его задача — не дать одному клиенту выжечь CPU, БД и почтовые квоты.

| Слой                         | Что отсекает                                        |
| ---------------------------- | --------------------------------------------------- |
| Cloudflare / DDoS-Guard      | L3/L4 флуд, ботнеты, большая часть L7               |
| nginx                        | лимиты по IP, slowloris, большие тела запросов      |
| NestJS (`@nestjs/throttler`) | лимиты по IP на endpoint, brute force логина и т.п. |

## Приложение

Глобальный `AppThrottlerGuard` (`src/shared/guards/app-throttler.guard.ts`)
применяется ко всем маршрутам. Конфиг — `src/config/throttler.config.ts`.

| Лимитер     | Ключ                  | По умолчанию            |
| ----------- | --------------------- | ----------------------- |
| `burst`     | IP, общий на весь API | 50 req / 1 с, блок 10 с |
| `sustained` | IP + endpoint         | 300 req / мин           |

Переопределение — декораторами на методе или контроллере:

```ts
@StrictRateLimit()  // 10 req / мин: login, register, reset-password, OAuth,
                    // invitations preview/accept, public feedback/support
@PublicRateLimit()  // 120 req / мин: публичные события каналов бронирования
@SkipRateLimit()    // без лимитов: /health
```

Новые пресеты добавлять в `src/shared/decorators/*-rate-limit.decorator.ts`.
`@SkipThrottle()` из пакета напрямую не использовать: без аргументов он
отключает только лимитер `default`, которого у нас нет.

Превышение — `429` с кодом `TOO_MANY_REQUESTS` и заголовками
`Retry-After-<name>`, `X-RateLimit-*-<name>`.

### Хранилище счётчиков: Redis

Счётчики общие для всех реплик и живут в Redis: `RedisThrottlerStorage`
(`src/shared/redis/redis-throttler.storage.ts`) подключается через `storage` в
`ThrottlerModule.forRootAsync` (`AppModule`). Лимит считается суммарно по всем
процессам, а не отдельно в каждом.

- Один Lua-скрипт (`redis-throttler.script.ts`) атомарно: если ключ блокировки есть —
  «заблокировано»; иначе `INCR` хитов (`PEXPIRE` окна на первом хите); хит сверх лимита
  ставит блокировку на `blockDuration` и обнуляет счёт. Без `blockDuration` хит сверх
  лимита отклоняется и не считается до конца окна.
- Ключи: `crm:throttle:<лимитер>:<ключ>` (хиты, TTL = окно) и
  `crm:throttle:<лимитер>:<ключ>:block`.
- Окно фиксированное (у встроенного хранилища в памяти — скользящее по каждому хиту):
  на границе окон можно получить до 2× лимита за короткое время — для этих лимитов допустимо.
- `Retry-After-*` и `X-RateLimit-Reset-*` — в секундах с округлением вверх, как у
  встроенного `ThrottlerStorageService`.

**Fail-open.** Если Redis недоступен или команда упала, запрос пропускается без лимита
(`{ totalHits: 0, isBlocked: false }`). Смену состояния соединения логирует `RedisService`,
ошибки команд — предупреждение не чаще раза в минуту. Лимиты на хостовом nginx в это время
продолжают работать.

Декораторы при смене хранилища не менялись. В юнит-тестах (`ThrottlerModule.forRoot`)
используется встроенное хранилище в памяти.

### Онлайн-запись: `PublicBookingRateLimiter`

Доменный лимит публичной записи, отдельно от `@nestjs/throttler`
(`src/modules/bookings/services/public-booking-rate-limiter.ts`): не больше 10 попыток с
одного телефона и 30 с одного IP за скользящие 10 минут, превышение — `429`
`BOOKING_RATE_LIMITED`. Сначала проверяется телефон, потом IP; отклонённая попытка не
считается.

Хранение — sorted set в Redis (`crm:booking-rate:phone:<телефон>`,
`crm:booking-rate:ip:<ip>`), один Lua-скрипт: `ZREMRANGEBYSCORE` старше окна → `ZCARD` →
при достижении лимита отказ → иначе `ZADD now <uuid>` и `PEXPIRE` на окно. Ошибка или
недоступность Redis — попытка пропускается (fail-open), предупреждение не чаще раза в минуту.

Скрипты обоих лимитов проверяются против настоящего Redis:
`REDIS_URL=redis://localhost:6379 npm run test:e2e` (`*.e2e-spec.ts` рядом с кодом,
без `REDIS_URL` пропускаются).

### IP клиента

`app.set('trust proxy', ...)` берётся из `TRUST_PROXY`. По умолчанию доверяем
частным сетям (`loopback, linklocal, uniquelocal`) — так работает nginx на хосте
и в Docker-сети. Без этого все запросы приходят с IP прокси, и лимит становится
общим для всех клиентов. Порт приложения не должен быть доступен снаружи напрямую,
иначе `X-Forwarded-For` можно подделать.

## nginx

```nginx
# http {}
limit_req_zone  $binary_remote_addr zone=api:20m   rate=30r/s;
limit_req_zone  $binary_remote_addr zone=auth:10m  rate=10r/m;
limit_conn_zone $binary_remote_addr zone=conn:10m;
limit_req_status  429;
limit_conn_status 429;

# server {}
client_max_body_size   30m;
client_body_timeout    10s;
client_header_timeout  10s;
send_timeout           15s;
keepalive_timeout      15s;
limit_conn conn 50;

location /auth/ {
    limit_req zone=auth burst=10 nodelay;
    proxy_pass http://127.0.0.1:3000;
    include proxy_params;
}

location / {
    limit_req zone=api burst=60 nodelay;
    proxy_pass http://127.0.0.1:3000;
    include proxy_params;
}
```

`proxy_params` должен передавать `X-Forwarded-For $proxy_add_x_forwarded_for`
и `X-Forwarded-Proto $scheme`. `client_max_body_size` — не меньше лимита (импорт отзывов — 25 МБ)
загрузки файлов импорта.

## Cloudflare

1. Перенести DNS в Cloudflare, включить проксирование (оранжевое облако).
2. SSL/TLS: Full (strict).
3. На VPS разрешить 80/443 только с [IP Cloudflare](https://www.cloudflare.com/ips/),
   SSH — только со своих адресов.
4. В nginx восстановить реальный IP:
   ```nginx
   # set_real_ip_from для каждого диапазона Cloudflare
   real_ip_header CF-Connecting-IP;
   ```
   Тогда `$binary_remote_addr` и `X-Forwarded-For` содержат IP клиента.
5. Security → WAF: rate limiting rule на `/auth/*`; при атаке — режим
   «Under Attack».
