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
- В публичный профиль локации ссылки не попадают. Клиент получает их в `reviewLinks` вместе с формой отзыва (пока отзыв можно оставить или он уже есть), фронтенд показывает их после отправки отзыва, независимо от оценки.
- Подсказка для фронтенда: Google — Business Profile → «Получить больше отзывов» → «Копировать»; Яндекс — страница организации на Картах. Ссылку стоит проверить в приватном окне.

## API панели управления

Права: `review:read` (чтение), `review:write` (запись). Выдаются владельцу и менеджеру. Карта прав — `docs/architecture/rbac-permissions-map.md`.

| API | Назначение |
| --- | --- |
| `GET /locations/:locationId/reviews` | Список: `page`, `pageSize`, `search`, `staffId`, `clientId` (карточка клиента), `status`, `rating`, `replied` (`false` — ждут ответа), `from`, `to`, `isExport` |
| `GET /locations/:locationId/reviews/summary` | Сводка с распределением, `hiddenCount`, `unansweredCount`. С `staffId` — по одному сотруднику (карточка сотрудника), с `clientId` — по одному клиенту (карточка клиента); можно комбинировать |
| `GET /locations/:locationId/reviews/:reviewId` | Один отзыв |
| `PATCH /locations/:locationId/reviews/:reviewId/visibility` | `{ status, reason? }`, причина скрытия необязательна |
| `PUT /locations/:locationId/reviews/:reviewId/reply` | `{ text }`, создать или изменить ответ |
| `DELETE /locations/:locationId/reviews/:reviewId/reply` | 204 |
| `DELETE /locations/:locationId/reviews/:reviewId` | 204, жёсткое удаление вместе с `ReviewStaff` |

Рейтинг сотрудника: поле `reviewSummary` (`{ count, average }` или `null`) в `StaffResponseDto` и `StaffDirectoryItemDto`. Отзывы сотрудника — список с `staffId`, сводка с распределением — `summary?staffId=`.

Карточка записи: `GET /locations/:locationId/bookings/:id` возвращает `BookingDetailsResponseDto` с полем `review` — тот же `ReviewResponseDto`, что в списке отзывов, включая скрытые. Поле заполняется только при праве `review:read`; у сотрудника с `booking.own:read` без этого права оно всегда `null`. В списке записей отзыва нет.

## Импорт из xlsx

Модуль `ReviewImportModule` (`src/modules/reviews/import/`) — перенос отзывов из другой CRM. Право `review.import:write` (уровень локации), выдаётся владельцу и менеджеру.

| API | Назначение |
| --- | --- |
| `GET /locations/:locationId/reviews/import/template` | Шаблон xlsx: заголовки, строка-пример и лист «Подсказки» |
| `POST /locations/:locationId/reviews/import` | multipart `file`. Ответ: `totalRows`, `importedCount`, `duplicateCount`, `errorCount`, `unmatchedStaffCount`, `unmatchedStaffNames` (до 100 уникальных имён), `errorsByCode`, `errors: [{ row, code }]` (первые 100) |

Один шаг, без предпросмотра и отката: валидные строки записываются сразу, невалидные пропускаются и перечисляются с номерами строк, как их показывает Excel. Пользователь исправляет строки и загружает файл снова — уже принятые строки становятся дубликатами.

**Файл.** Только `.xlsx`, до 25 МБ и 50 000 непустых строк, читается первый лист. Заголовок — первая непустая строка. Ошибки файла (`400`, `413`, `422`): `REVIEW_IMPORT_FILE_MISSING`, `_FILE_TOO_LARGE`, `_FILE_UNSUPPORTED`, `_FILE_CORRUPT`, `_MISSING_COLUMNS` (в `responseValue` — недостающие колонки), `_FILE_EMPTY`, `_TOO_MANY_ROWS`.

**Колонки** (регистр, `ё` и лишние пробелы в заголовке не важны):

| Колонка | Обязательна | Правило | Код ошибки строки |
| --- | --- | --- | --- |
| Оценка (`оценка`, `рейтинг`, `звезды`, `rating`, `stars`) | да | Целое 1–5: `5`, `5.0`, `5 звёзд` | `RATING_INVALID` |
| Дата (`дата`, `дата отзыва`, `date`) | да | `dd.MM.yyyy[ HH:mm[:ss]]`, `yyyy-MM-dd[ HH:mm[:ss]]`, ISO, дата-ячейка Excel. Не раньше 2000 года и не в будущем | `DATE_INVALID` |
| Текст (`текст`, `отзыв`, `комментарий`, `text`, `review`) | да | Простой текст до 2000 символов, разметка удаляется | `TEXT_REQUIRED`, `TEXT_TOO_LONG` |
| Автор (`автор`, `клиент`, `author`) или `Имя` + `Фамилия` | нет | До 100 символов на часть. Одна колонка делится по первому пробелу. Пусто — `null` | `AUTHOR_TOO_LONG` |
| Сотрудник (`сотрудник`, `мастер`, `staff`) | нет | Несколько имён через `,` `;` `/` или перенос строки | — |
| Источник (`источник`, `source`) | нет | До 100 символов, любое значение. Виден только в панели (`source` в `ReviewResponseDto`) | `SOURCE_TOO_LONG` |
| Ответ (`ответ`, `reply`) | нет | До 2000 символов. `repliedAt` = дата отзыва, `repliedByName = null` | `REPLY_TOO_LONG` |
| ID (`id`, `id отзыва`) | нет | До 128 символов | `ID_TOO_LONG` |

В строке сообщается первая найденная ошибка в порядке колонок таблицы.

**Даты.** Дата без пояса — «стенное» время филиала (`Location.timezone`), переводится в UTC через `TimeUtils.localToUtc` с учётом перехода на летнее время. Дата-ячейка Excel читается UTC-геттерами, поэтому результат не зависит от пояса сервера. Дата без времени ставится на 12:00 по филиалу. Дата со смещением (`…Z`, `…+03:00`) берётся как есть.

**Сотрудники.** Каждое имя сопоставляется с активными сотрудниками локации без учёта регистра, `ё` и пробелов (`StaffService.matchActiveByNames`). Отзыв привязывается ко всем найденным; имя без совпадений или с несколькими совпадениями пропускается, учитывается в `unmatchedStaffCount` и попадает в `unmatchedStaffNames`. Если не найден никто, отзыв остаётся на уровне локации.

**Дедупликация.** `importKey` уникален в локации: `id:<ID>` из файла, иначе `sha256:` от автора, даты, оценки и текста (без учёта регистра и пробелов). Запись — `createManyAndReturn` со `skipDuplicates`, поэтому повторная загрузка и разбиение файла с пересечением безопасны. Два разных отзыва с одинаковыми автором, датой, оценкой и текстом сливаются в один. Удалённый вручную импортированный отзыв вернётся при повторной загрузке того же файла.

**Запись.** Файл читается потоково в два прохода (`XlsxUtils.rows`): первый проверяет заголовок и считает строки, второй разбирает строки и пишет пачками по 500, каждая пачка — своя транзакция под `acquireActiveOperationLock` локации. После импорта один раз сбрасывается кэш сводок и пишется одна запись аудита `REVIEW_IMPORT_COMPLETED` (если что-то загружено): имя файла и счётчики, `entityId` — id партии. `importBatchId` хранится только для разбора через SQL, наружу не отдаётся.

Импортированные отзывы входят в рейтинг как обычные, клиентам источник не показывается.

## Публичный API

| API | Назначение |
| --- | --- |
| `GET /public/locations/:locationId/reviews` | Опубликованные отзывы: `page`, `pageSize` (по умолчанию 10, максимум 50), `staffId`, `rating`, `orderBy` (`reviewedAt` по умолчанию или `rating`), `orderDirection`. `isExport` не поддерживается: список всегда постраничный. `summary` — по сотруднику, если задан `staffId`, иначе по локации; фильтр `rating` на неё не влияет |
| `GET /public/booking-pages/:slug`, `GET /public/booking-widgets/:widgetId` | Поле `reviews: { summary, latest }` (последние 3) |
| booking setup | `reviewSummary` у каждого сотрудника |

Элемент отзыва: `id`, `authorName` (маскированное), `rating`, `text`, `reviewedAt`, `reply`, `staff`.

## Аудит

Сущность `REVIEW`. Отслеживаемые поля: `rating`, `text`, `status`, `hiddenReason`, `replyText`. События: создание (актор — клиент), изменение, смена видимости, ответ, удаление ответа, удаление отзыва (со снимком), импорт (`REVIEW_IMPORT_COMPLETED`, одна запись на файл). Изменения `googleReviewUrl`, `yandexReviewUrl`, `reviewsEnabled` попадают в аудит локации.

## Границы модулей

- `BookingsModule` и `StaffModule` импортируют `ReviewsModule`; `ReviewsModule` не знает о них, цикла нет. Данные записи для отзыва передаются в `ReviewsFacade` аргументами.
- Ссылки на карты читаются через `LocationService` (кэш настроек), таблица `Location` из bookings и reviews напрямую не читается.

## Дальше

- Фаза 3: экспорт, дашборд, уведомление владельцу о плохой оценке.
