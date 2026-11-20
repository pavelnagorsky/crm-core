# Источники записей

Откуда пришла запись и клиент. Технический канал записи (`channel`: страница, виджет,
журнал) и маркетинговый источник (`trafficSource`) - разные поля.

## Модель

- `Booking.channel` (`BookingChannel`): `PUBLIC_PAGE`, `WIDGET`, `MANUAL`. Раньше
  назывался `source` (`BookingSource`); миграция `20261120120000_traffic_attribution`
  переименовала тип и колонку, данные сохранены.
- `Booking.trafficSource` (`TrafficSource`) и `trafficSourceDetail` (до 64 символов).
  У онлайн-записи источник есть всегда (`DIRECT`, если ничего не известно), его
  нельзя изменить. У ручной записи его выбирает администратор, `null` - не указан.
- `BookingTrafficTouch` (1:1 с онлайн-записью, пишется один раз): сырые UTM, внешний
  хост реферера, тип и значение click id, `touchedAt`. Для прямого захода не создаётся.
  Значение click id стирается через 90 дней (`BookingCronService.purgeClickIds`),
  тип остаётся.
- `Client.acquisitionSource`, `acquisitionSourceDetail`, `acquisitionBookingId`,
  `acquiredAt`: источник первой записи клиента в бренде. `importedAt` ставит импорт
  клиентов; импортированный клиент никогда не считается новым.
- `BookingTrafficStat`: просмотры и открытия формы страниц и виджетов по часам UTC и
  источнику. Ключ `{locationId, hourStart, channelId, source}`, без FK на канал, чтобы
  история пережила удаление. Хранится 25 месяцев (`BookingTrafficService.purgeExpiredStats`,
  раз в месяц). Счётчики `BookingPageStats` и `BookingWidgetStats` остаются.

`TrafficSource`: `DIRECT`, `INSTAGRAM`, `VK`, `TELEGRAM`, `WHATSAPP`, `TIKTOK`,
`FACEBOOK`, `YANDEX_MAPS`, `TWO_GIS`, `GOOGLE_MAPS`, `SEARCH`, `PAID_ADS`, `WEBSITE`,
`MAILING`, `OFFLINE`, `REFERRAL`, `PHONE_CALL`, `WALK_IN`, `OTHER`. Ручной список - всё,
кроме `DIRECT`. `PHONE_CALL` и `WALK_IN` из ссылок не получаются. Русские подписи - в
`ru.json` (`trafficSource`, `NONE` = «Не указан»).

## Классификация

Клиент (страница записи, виджет) хранит последнее непрямое касание 30 дней и отправляет
его как есть в `traffic` (`TrafficTouchDto`). Классифицирует только backend
(`src/shared/traffic/rules/traffic-classify.rules.ts`), первое совпадение:

1. Платный click id: `gclid`, `gbraid`, `wbraid` (google), `yclid` (yandex), `ttclid`
   (tiktok), `msclkid` (bing) - `PAID_ADS`, уточнение - `utm_source` или платформа.
2. Платный `utm_medium` (`cpc`, `ppc`, `cpm`, `paid_social`, `target`, `таргет` и др.) -
   `PAID_ADS` / `utm_source`.
3. Известный `utm_source` (алиасы соцсетей, мессенджеров и карт; `yandex`/`google` с
   `utm_medium` карт - карты; поисковики с пустым или поисковым `utm_medium` - `SEARCH`).
4. `utm_medium` рассылки, офлайна или рекомендации.
5. Хост реферера: соцсети, `*.2gis.*`, `maps.google.*`, `maps.yandex.*`, рекламные
   редиректы Google, поисковики. `ysclid` без реферера - `SEARCH` / yandex (это не реклама).
6. Неизвестный `utm_source` - `OTHER` / `utm_source`.
7. Любой другой внешний хост - `WEBSITE` / хост.
8. Только `fbclid` - `INSTAGRAM`.
9. Иначе - `DIRECT`.

Токены сравниваются в нижнем регистре, пробелы заменяются на `_`. Уточнение: нижний
регистр, недопустимые символы - `_`, до 64 символов. Хост реферера: без порта, точки в
конце, `www.` и `m.`, IDN в punycode; наш хост (`DOMAIN`) и его поддомены не считаются
реферером. Пресеты ссылок на frontend совпадают с правилами (instagram/social,
yandex_maps/maps, 2gis/maps, google_maps/maps, vk/social, telegram/social, реклама с `cpc`).

Данные трафика никогда не отклоняют запрос: не строки отбрасываются, управляющие символы
удаляются, значения обрезаются, UTM с email или 7+ цифрами подряд отбрасываются,
`touchedAt` вне [сейчас - 31 день, сейчас + 5 минут] отбрасывается, не объект в
`traffic` игнорируется.

## API

- `POST /public/locations/{locationId}/bookings` (`PublicCreateBookingDto`):
  `bookingPageId`, `bookingWidgetId` и `traffic`. `traffic` не входит в хэш
  идемпотентности.
- `POST /public/booking-pages/{pageId}/events`, `POST /public/booking-widgets/{widgetId}/events`:
  `{ event, traffic? }`. Увеличивают общий счётчик канала и `BookingTrafficStat` по
  источнику визита.
- `POST /locations/{locationId}/bookings/manual`: `trafficSource` (ручной список,
  `DIRECT` - 400), `trafficSourceDetail` (только с источником,
  иначе 400 `TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE`).
- `PUT /locations/{locationId}/bookings/{id}`: `trafficSource` и `trafficSourceDetail`
  (не передан - без изменений, `null` - очистить, смена источника без уточнения очищает
  уточнение). Только для `MANUAL`, иначе 400 `BOOKING_TRAFFIC_SOURCE_READ_ONLY`.
- Ответы записи: `channel`, `bookingPageId`, `bookingWidgetId`, `trafficSource`,
  `trafficSourceDetail`. Карточка записи добавляет `traffic` (касание без значения
  click id) и `isClientAcquisition`. Клиентские публичные ответы этих полей не содержат.
- Список и экспорт записей: `channels[]`, `trafficSources[]`, `trafficSourceNotSet`
  (по OR с `trafficSources`), `trafficSourceDetail` и `utmCampaign` (точное совпадение
  без учёта регистра), `newClientsOnly`; сортировка `channel` и `trafficSource`.
  Экспорт: «Канал», «Источник» (подпись и «: уточнение»), UTM source, medium, campaign.
- Клиенты: в ответе `acquisitionSource`, `acquisitionSourceDetail`, `acquiredAt`,
  `acquisitionBookingId`; в создании и изменении `acquisitionSource`,
  `acquisitionSourceDetail` (те же правила, что у записи); фильтр `acquisitionSources[]`;
  в экспорте «Источник привлечения».

## Привлечение клиента

Первая запись клиента в бренде (онлайн или ручная) записывает привлечение в той же
транзакции, что и запись: `ClientsService.recordAcquisition` обновляет клиента только
при `acquiredAt IS NULL AND importedAt IS NULL`. Блокировка строки упорядочивает
параллельные первые записи, поэтому привлечение ровно одно. Источник, который
администратор указал в профиле до первой записи, сохраняется.

- Исправление источника ручной записи, которая привлекла клиента, переносится в профиль
  (`syncAcquisitionSource`).
- Перенос записи к другому клиенту (`BookingClientLinkService.syncAcquisition`): старый
  клиент теряет привлечение по этой записи (следующая запись привлечёт его снова), новый
  получает его, если ещё не привлечён.

## Аналитика

- `POST /locations/{locationId}/bookings/analytics`, ключ `TRAFFIC_SOURCES`
  (`WidgetKind.TABLE`): строки по источнику (`id` - источник или `NONE`) и вложенные
  строки по уточнению (`SOURCE:detail`, топ 10 и `SOURCE:__other__`). Колонки `views`,
  `formOpens`, `bookings`, `newClients`, `completedVisits`, `completedRevenue`,
  `conversionPct`. Записи считаются по `createdAt` в периоде
  (`BookingsAggregatesService.trafficSourceTotals`, один запрос с GROUPING SETS).
  Конверсия = записи со страницы или виджета / просмотры * 100, `null` без просмотров.
  С `staffId` просмотры, открытия и конверсия - `null`. Без сравнения с прошлым периодом.
- `BOOKINGS_BY_TRAFFIC_SOURCE` в аналитике записей и на дашборде: столбцы по источнику,
  `value` - записи, `secondaryValue` - новые клиенты.
- Дашборд: `BOOKINGS_BY_SOURCE` переименован в `BOOKINGS_BY_CHANNEL`.
- Аналитика клиентов: `NEW_CLIENTS_BY_SOURCE` - клиенты бренда, привлечённые в периоде,
  по источнику привлечения.
