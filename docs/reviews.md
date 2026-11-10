# Отзывы

Модуль `ReviewsModule` — владелец таблиц `Review` и `ReviewStaff`. Другим модулям доступен только `ReviewsFacade`. План и принятые решения — `docs/reviews-plan.md`.

## Модель

- Один отзыв на запись (`Review.bookingId` уникален). Клиент оставляет его на странице управления записью, правит до конца срока доступа, удалить не может.
- `rating` — целое 1–5, `text` — обязательный простой текст до 2000 символов (HTML удаляется, пустой результат отклоняется).
- Автор — снимок `authorFirstName`/`authorLastName` из записи на момент первого сохранения. В публичном ответе имя маскируется («Анна К.»), `null`, если автор неизвестен. Полное имя видно только в панели.
- Мастера (`ReviewStaff`) берутся из `BookingItem.staffId` при первом сохранении и не пересчитываются. Одна оценка и один текст засчитываются каждому мастеру визита. В рейтинге локации отзыв учитывается один раз.
- Статусы: `PUBLISHED` и `HIDDEN`. Скрытые отзывы не входят в `count` и `average` и не видны публично.
- Публичный ответ бизнеса: один на отзыв (`replyText`, `repliedAt`, `repliedByName` — снимок). Виден, пока отзыв опубликован.

## Правила показа

Источник истины — бэкенд, фронтенд использует поля ответа.

| Опубликованных отзывов | Ответ |
| --- | --- |
| 0 | `count: 0`, `average: null`. Блок не показывать, звёзды и «0.0» не рисовать |
| 1–2 | `count`, `average: null`. Показать список и «N отзыва», итоговую оценку не рисовать |
| 3 и больше (`REVIEWS_MIN_FOR_AVERAGE`) | `average` с одним знаком после запятой, `distribution` |

Правила одинаковы для локации и сотрудника. Агрегаты не хранятся: считаются `groupBy` и кэшируются, кэш сбрасывается при создании, правке, скрытии и удалении отзыва.

## Клиентский сценарий

Подробности — `docs/booking-client-management.md`, раздел «Отзыв о визите».

- Доступ к странице управления для `COMPLETED` записей продлён до `endAt + 14 дней`, отмена и перенос остаются недоступны.
- `GET /public/bookings/me` возвращает `canReview`, `canReviewUntil`, `review`, `reviewLinks`.
- `PUT /public/bookings/me/review` — `{ rating, text }`, создаёт или правит отзыв. Ошибка `403 / REVIEW_NOT_ALLOWED`: визит не завершён, запись удалена, отзывы выключены у локации или срок вышел.
- Условия разрешения — чистая функция `review-eligibility.rules.ts`.

### Запрос отзыва по email

`BookingCronService.sendReviewRequests` (раз в час) берёт записи, у которых:

- `status = COMPLETED`, `endAt` была больше 2 часов и не больше 7 дней назад;
- есть `clientEmail`, `reviewRequestSentAt IS NULL`, запись не удалена;
- у локации включены отзывы (`reviewsEnabled`), локация и бренд не удалены;
- отзыва ещё нет (`ReviewsFacade.findReviewedBookingIds`).

Запись «забирается» атомарным `updateMany` внутри блокировки активной локации (`reviewRequestSentAt`), поэтому письмо уходит один раз даже при параллельных запусках. Письмо `ReviewRequestNotification` (шаблон `review-request`) содержит ссылку управления записью. Менеджер может отправить ссылку вручную через `POST .../client-token`.

## Ссылки на карты

В настройках локации: `googleReviewUrl`, `yandexReviewUrl`, `reviewsEnabled` (в `CreateLocationDto`, `UpdateLocationDto`, `LocationResponseDto`, `LOCATION_AUDIT_FIELDS`). Права те же, что на остальные настройки локации.

- Обрезка пробелов, пустое значение → `null`, только `https`, до 2048 символов, без логина, пароля и порта.
- Принимаются только свои площадки (`googleReviewTarget`, `yandexReviewTarget` в `src/shared/regular-expressions.ts`, проверка — `location/rules/review-links.ts`):
  - Google: `g.page/r/<код>/review`, `search.google.com/local/writereview`, `google.com/maps/place/…`;
  - Яндекс: `yandex.{ru,by,kz,uz,com}/maps/org/…`, `yandex.{…}/profile/<id>`.
- Сокращённые ссылки (`maps.app.goo.gl`, `goo.gl`), похожие хосты (`evilgoogle.com`, `google.com.evil.ru`) и другие пути отклоняются.
- В публичный профиль локации ссылки не попадают. Клиент получает их в `reviewLinks` только после того, как оставил отзыв, независимо от оценки.
- Подсказка для фронтенда: Google — Business Profile → «Получить больше отзывов» → «Копировать»; Яндекс — страница организации на Картах. Ссылку стоит проверить в приватном окне.

## API панели управления

Права: `review:read` (чтение), `review:write` (запись). Выдаются владельцу и менеджеру. Карта прав — `docs/architecture/rbac-permissions-map.md`.

| API | Назначение |
| --- | --- |
| `GET /locations/:locationId/reviews` | Список: `page`, `pageSize`, `search`, `staffId`, `status`, `rating`, `from`, `to`, `isExport` |
| `GET /locations/:locationId/reviews/summary` | Сводка с распределением, опционально по `staffId` |
| `GET /locations/:locationId/reviews/:reviewId` | Один отзыв |
| `PATCH /locations/:locationId/reviews/:reviewId/visibility` | `{ status, reason? }`, причина обязательна при скрытии |
| `PUT /locations/:locationId/reviews/:reviewId/reply` | `{ text }`, создать или изменить ответ |
| `DELETE /locations/:locationId/reviews/:reviewId/reply` | 204 |
| `DELETE /locations/:locationId/reviews/:reviewId` | 204, жёсткое удаление вместе с `ReviewStaff` |

Рейтинг сотрудника: поле `reviewSummary` (`{ count, average }` или `null`) в `StaffResponseDto` и `StaffDirectoryItemDto`. Отзывы сотрудника — список с `staffId`.

## Публичный API

| API | Назначение |
| --- | --- |
| `GET /public/locations/:locationId/reviews` | Опубликованные отзывы: `page`, `pageSize` (по умолчанию 10, максимум 50), `staffId`, `rating` |
| `GET /public/booking-pages/:slug`, `GET /public/booking-widgets/:widgetId` | Поле `reviews: { summary, latest }` (последние 3) |
| booking setup | `reviewSummary` у каждого сотрудника |

Элемент отзыва: `id`, `authorName` (маскированное), `rating`, `text`, `reviewedAt`, `reply`, `staff`.

## Аудит

Сущность `REVIEW`. Отслеживаемые поля: `rating`, `text`, `status`, `hiddenReason`, `replyText`. События: создание (актор — клиент), изменение, смена видимости, ответ, удаление ответа, удаление отзыва (со снимком). Изменения `googleReviewUrl`, `yandexReviewUrl`, `reviewsEnabled` попадают в аудит локации.

## Границы модулей

- `BookingsModule` и `StaffModule` импортируют `ReviewsModule`; `ReviewsModule` не знает о них, цикла нет. Данные записи для отзыва передаются в `ReviewsFacade` аргументами.
- Ссылки на карты читаются через `LocationService` (кэш настроек), таблица `Location` из bookings и reviews напрямую не читается.

## Дальше

- Фаза 2 (`feature/reviews-import`): импорт отзывов из xlsx, раздел 6.2 плана.
- Фаза 3: экспорт, дашборд, уведомление владельцу о плохой оценке.
