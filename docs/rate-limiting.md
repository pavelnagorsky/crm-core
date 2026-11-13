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

Счётчики хранятся в памяти процесса. При нескольких репликах подключить
общее хранилище (`@nest-lab/throttler-storage-redis`) через `storage` в
`throttlerConfig` — декораторы менять не нужно.

Доменный лимит `PublicBookingRateLimiter` (по телефону и IP) остаётся отдельно.

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
