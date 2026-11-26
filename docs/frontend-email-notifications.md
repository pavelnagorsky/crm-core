# Frontend: журнал email-уведомлений (админка платформы)

Все письма платформы записываются в журнал: клиентам, сотрудникам, владельцам, админам. Страница
админки показывает, работает ли отправка, что ушло, что застряло, и позволяет повторить или отменить
письмо. Доступ только у платформенного админа (`role = ADMIN`), как в разделе биллинга: остальным
`403`, без токена `401`.

Схемы - в `/api-json`, тег `Notifications administration`. Ответы обёрнуты в `BaseResponseDto`.

## Как письмо живёт

| Статус | Что значит | Действия |
| --- | --- | --- |
| `QUEUED` | Ждёт отправки | Отменить |
| `SENDING` | Сейчас уходит на SMTP | - |
| `RETRYING` | Попытка не удалась, следующая в `nextAttemptAt` | Отменить |
| `SENT` | SMTP принял письмо | Отправить ещё раз |
| `FAILED` | Попытки кончились или ошибка постоянная - **требует внимания** | Повторить, отменить |
| `SKIPPED` | Не отправлялось: `skipReason` | Повторить (если позволяет `retryBlock`) |
| `CANCELLED` | Отменено: `cancelReason` | Повторить |

- Автоматически делается 6 попыток примерно за 15-30 минут. Постоянные ошибки (нет такого ящика,
  удалён бизнес, ошибка шаблона) не повторяются: письмо сразу `FAILED`.
- `skipReason`: `CLIENT_NOTIFICATIONS_DISABLED` - письма клиентам выключены в окружении (stage);
  `OUTDATED` - визит уже начался, письмо потеряло смысл.
- `cancelReason`: `ADMIN` - отменил админ; `BOOKING_CHANGED` - бронь отменили, удалили или перенесли,
  и неотправленные письма клиенту по ней устарели.
- `deliveryMode = DIRECT`: подтверждение email, сброс пароля, приглашения, тестовое письмо.
  Отправляются один раз без очереди, содержимое не хранится: нет превью и повтора
  (`retryBlock = NOT_STORED`).
- Журнал хранит письма 90 дней.

Можно ли действие - решает бэкенд, фронтенд не повторяет правила:
- `retryBlock: null` - кнопка «Повторить» доступна. Иначе причина: `NOT_STORED`, `IN_PROGRESS`,
  `OUTDATED`, `CLIENT_NOTIFICATIONS_DISABLED` - показать её в подсказке.
- `canCancel` - доступна «Отменить».

## API `/admin/notifications/emails`

| Метод | Путь | Ответ |
| --- | --- | --- |
| GET | `/overview?period=24h\|7d\|30d&timezone=Europe/Minsk` | `EmailOverviewDto` |
| GET | `/settings` | `EmailSettingsDto` |
| GET | `/counts?<фильтры>` | `EmailStatusCountDto[]` - все статусы, нули включены |
| GET | `/?<фильтры>&page&pageSize&orderBy&orderDirection` | `EmailSearchResponseDto` |
| GET | `/{id}` | `EmailMessageDetailsDto` - с `events` (таймлайн) |
| GET | `/{id}/preview` | `{ subject, html }` |
| POST | `/{id}/retry` | `EmailMessageDto` |
| POST | `/{id}/cancel` | `EmailMessageDto` |
| POST | `/retry` | `{ affected, skipped }` |
| POST | `/cancel` | `{ affected, skipped }` |
| POST | `/test` | `EmailTestResultDto` |

### Фильтры списка и счётчиков

`status[]`, `template[]` (массивы - повтором ключа), `audience` (`CLIENT` / `ACCOUNT`), `brandId`,
`locationId`, `bookingId`, `search` (часть адреса или темы), `queuedFrom` / `queuedTo` (ISO,
`[from, to)`). `/counts` принимает те же фильтры и игнорирует `status` - это счётчики вкладок.

Сортировка `orderBy`: `queuedAt` (по умолчанию), `sentAt`, `attempts`; `orderDirection` по умолчанию
`desc`.

### Обзор

- `period`: `24h` - график по часам, `7d` / `30d` - по дням. `timezone` - пояс браузера админа:
  границы столбиков по его часам. `from` - начало периода (кратно часу или полуночи), конец - сейчас.
- `health.status`:
  - `OK` - последние попытки успешны;
  - `DEGRADED` - за последний час были ошибки SMTP;
  - `DOWN` - 3+ ошибки SMTP подряд или очередь не работает;
  - `IDLE` - за сутки не было ни одной попытки.
  Ошибки данных (удалён бизнес, шаблон) на здоровье SMTP не влияют.
- `totals` - письма, поставленные за период, по текущему статусу; `successRate` - доля 0..1.
- `backlog` - сколько ждёт отправки прямо сейчас и с какого момента.
- `needsAttention` - все `FAILED` в журнале: счётчик для бейджа в меню.
- `deliveryTime` - медиана и p95 от постановки до приёма SMTP, `null` без данных.
- `series` - все столбики периода, пустые тоже: `sent`, `failed`, `skipped`, `inProgress`.
- `templates` - по типам писем; `errors` - до 5 частых ошибок попыток.

### Действия

- Повтор даёт письму новый набор из 6 попыток. Можно повторить и отправленное (`SENT`) -
  например, клиент удалил письмо. После действия перезапросить список, счётчики и обзор.
- Массовые `POST /retry` и `/cancel` принимают `{ ids }` (выбранные строки, до 1000) или
  `{ filter }` (все по фильтру, до 1000, старые первыми). Неподходящие письма пропускаются:
  `skipped` в ответе.
- `409 EMAIL_RETRY_UNAVAILABLE` (с `responseValue.reason`), `409 EMAIL_CANCEL_UNAVAILABLE`,
  `409 EMAIL_PREVIEW_UNAVAILABLE` (у `DIRECT`-писем нет содержимого), `404` - письма нет.
- `POST /test` `{ to, timezone? }` отправляет тестовое письмо сразу, мимо очереди, и возвращает
  ответ SMTP: `sent`, `durationMs`, `error`, `errorCode`. Запрос ждёт ответа сервера (до ~45 с).

### Превью

`html` - полный документ письма, отрисованный сейчас из сохранённых данных (с текущим названием и
логотипом бренда). Показывать только в `<iframe sandbox srcDoc>`.

## Типы писем (`template`)

| Значение | Кому | Что |
| --- | --- | --- |
| `booking-pending` | клиент | Запись ждёт подтверждения |
| `booking-confirmed` | клиент | Запись подтверждена |
| `booking-status-changed` | клиент | Подтверждение, перенос или отмена записи |
| `booking-reminder` | клиент | Напоминание о визите |
| `review-request` | клиент | Просьба оставить отзыв |
| `staff-booking-event` | сотрудники | Клиент записался, перенёс или отменил |
| `access-invitation` | приглашённый | Приглашение в команду |
| `confirm-email` | аккаунт | Подтверждение email |
| `reset-password` | аккаунт | Код сброса пароля |
| `subscription-trial-ending` | владелец | Заканчивается пробный период |
| `subscription-period-ending` | владелец | Заканчивается оплаченный период |
| `subscription-access-ended` | владелец | Доступ закончился |
| `subscription-access-limited` | владелец | Доступ ограничен |
| `subscription-payment-requested` | владелец | Создана заявка на оплату |
| `subscription-payment-received` | владелец | Оплата получена |
| `admin-subscription-payment-requested` | админ | Новая заявка на оплату |
| `smtp-test` | админ | Проверка отправки |
| `support-request-received` | автор обращения | Обращение в поддержку получено |
| `support-request-forwarded` | ящик поддержки | Новое обращение, ссылка на `/admin/support/<id>/` |
| `feedback-received` | автор заявки на демо (если оставил email) | Заявка получена |
| `feedback-forwarded` | ящик продаж | Новая заявка на демо, ссылка на `/admin/feedback/<id>/` |

Письма поддержки и заявок на демо идут с `audience = ACCOUNT`: адрес человек оставил сам, письма
уходят и на stage.

## Отправители и Reply-To

Правила в одном месте: `src/modules/notifications/rules/email-sender.rules.ts`. Отправитель
решается по типу письма, поэтому повтор из журнала уходит с того же ящика. Имя отправителя не
меняется: Klendo или название бренда.

| Письма | From | Reply-To | Строка в подвале |
| --- | --- | --- | --- |
| `subscription-*`, `feedback-received` | sales | - | Ответ получит менеджер |
| `confirm-email`, `reset-password`, `access-invitation`, `staff-booking-event` | noreply | support | Отвечать не нужно |
| `support-request-received` | noreply | support | Ответьте, чтобы дополнить обращение |
| `support-request-forwarded`, `feedback-forwarded` | noreply | автор (из данных письма) | Ответ уйдёт клиенту |
| Письма клиентам бизнеса, `admin-subscription-payment-requested`, `smtp-test` | noreply | - | Отвечать не нужно |

- Адрес автора для Reply-To хранится в данных письма (`payload.replyTo`), поэтому переживает повтор.
  У заявки только с телефоном Reply-To нет.
- Письмам клиентам бизнеса Reply-To не ставится: ответ там адресован салону, а не Klendo.
- Если роли указывают на один ящик (dev), Reply-To, равный From, не ставится.
- `GET /settings` -> `sender` - ящик noreply. `POST /test` шлёт с него.
