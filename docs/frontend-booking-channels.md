# Контракт страниц и виджетов онлайн-записи

OpenAPI: [booking-channels.openapi.json](./booking-channels.openapi.json).
Схема генерируется из контроллеров и DTO: `npm run build`, затем
`node scripts/export-booking-channels-openapi.mjs`. В работающем API полный
контракт доступен по `/api-json`, Swagger UI — `/api`.

## Ограничение количества страниц

POST `/locations/{locationId}/booking-pages` проверяет наличие страницы у филиала
независимо от её статуса. Если страница уже есть, API возвращает `409 Conflict`
с `responseCode: BOOKING_PAGE_ALREADY_EXISTS`. Использовать редактирование существующей
страницы; после её удаления можно создать новую. Страницы других филиалов не влияют
на проверку. Существующие дополнительные страницы остаются доступными.

Проверка выполняется в сервисе без изменения схемы БД. Она не гарантирует запрет
дубликатов при одновременных запросах на создание.

## Заголовки страницы

POST `/locations/{locationId}/booking-pages` и PUT
`/locations/{locationId}/booking-pages/{pageId}` требуют `heading: string | null`.
Пробелы по краям удаляются; пустая строка становится `null`; максимум — 120
символов после обрезки. Пропущенное поле, иной тип и превышение длины дают 400.
HTML в `heading` остаётся обычным текстом; выводить через текстовый узел.

Административные ответы возвращают `responseValue.heading`, публичный GET
`/public/booking-pages/{slug}` — `responseValue.page.heading`. Значение `null`
возвращается без подстановки. У виджета поля `heading` нет.

| Поле            | Назначение                         |
| --------------- | ---------------------------------- |
| `title`         | Внутреннее название страницы в CRM |
| `heading`       | Публичный H1                       |
| `tagline`       | Слоган под H1                      |
| `form.headline` | Заголовок формы записи             |
| `form.caption`  | Подзаголовок формы записи          |
| `metaTitle`     | Заголовок вкладки и SEO            |

Frontend вычисляет H1: `page.heading ?? (location.brandName?.trim() || 'Онлайн-запись')`.
Не использовать `page.title` и внутреннее `location.name` для подстановки.
Поля `html`, `tagline`, SEO, `coverFileId` в запросах и `cover` в ответах сохранены.
Публичный `location` по-прежнему содержит бренд, логотип, город и адрес.

## Google Tag Manager и Яндекс Метрика

Настройки аналитики принадлежат странице записи или виджету. POST
`/locations/{locationId}/booking-pages` и PUT
`/locations/{locationId}/booking-pages/{pageId}` принимают два необязательных поля
на верхнем уровне, рядом с `metaTitle`. Аналогичные поля принимают POST
`/locations/{locationId}/booking-widgets` и PUT
`/locations/{locationId}/booking-widgets/{widgetId}`:

```json
{
  "gtmId": "GTM-ABC1234",
  "yandexMetrikaId": "12345678"
}
```

- `gtmId`: строка `GTM-` и заглавные латинские буквы/цифры, максимум 32 символа.
  Это ID контейнера Google Tag Manager. ID Google Analytics вида `G-…` не подходит.
- `yandexMetrikaId`: строка из 1-15 цифр, первая цифра не ноль.
  Передавать строкой, а не JSON-числом.
- Пробелы по краям удаляются. `null`, пустая или пробельная строка отключают
  соответствующую интеграцию. Поля независимы, можно включить обе интеграции.
- Пропущенное поле при создании остаётся `null`; при обновлении сохраняет прежнее
  значение. Неверный формат или тип даёт `400`.

Административные ответы возвращают `responseValue.gtmId` и
`responseValue.yandexMetrikaId`. Публичный GET `/public/booking-pages/{slug}`
возвращает их в `responseValue.page`. Оба поля в ответах имеют тип `string | null`.
Публичный GET `/public/booking-widgets/{widgetId}` возвращает их в
`responseValue.widget`. Для страниц используется миграция
`20261030120000_booking_page_analytics`, для виджетов -
`20261030130000_booking_channel_stats`. На существующих каналах значения `null`.

### Подключение на frontend

Backend хранит и проверяет ID; скрипты и отправку событий подключает frontend.
В редакторе нужны поля «Google Tag Manager (GTM-ID)» и «Яндекс Метрика (ID счётчика)».
Загружать счётчики только на опубликованной публичной странице или виджете с заполненным ID,
не в CRM и не в предпросмотре редактора. При повторном рендере не инициализировать
счётчики повторно; при смене страницы не отправлять события в счётчик прежней страницы.

Google: подключить контейнер по
[официальной инструкции GTM](https://support.google.com/tagmanager/answer/14847097).
Создать `window.dataLayer = window.dataLayer || []` до загрузки контейнера.
Владелец контейнера должен настроить и опубликовать Google Analytics и триггеры;
сохранение GTM-ID само по себе не настраивает Google Analytics.

Яндекс: загрузить `https://mc.yandex.ru/metrika/tag.js` и вызвать
`ym(Number(yandexMetrikaId), 'init', options)` по
[инструкции инициализации](https://yandex.ru/support/metrica/ru/code/counter-initialize.html).
Если Метрика уже установлена через GTM, не подключать тот же счётчик второй раз.

Предлагаемый контракт событий для реализации на frontend:

| Событие           | Когда отправлять                                  |
| ----------------- | ------------------------------------------------- |
| `booking_start`   | Первое взаимодействие клиента с формой записи     |
| `booking_success` | Только после успешного ответа API создания записи |

Для GTM использовать `window.dataLayer.push({ event: 'booking_success' })`
([dataLayer](https://developers.google.com/tag-platform/tag-manager/datalayer));
для Метрики - `ym(Number(yandexMetrikaId), 'reachGoal', 'booking_success')`
([reachGoal](https://yandex.ru/support/metrica/ru/objects/reachgoal)).
В Метрике создать цель с соответствующим именем. Не считать нажатие «Записаться»,
ошибку API или повторный рендер подтверждения успешной записью. Блокировка
аналитики не должна мешать записи. Не передавать имя, телефон, email, комментарии
клиента или ссылку управления записью в события аналитики.

## Собственная статистика страниц и виджетов

Административные ответы списка, получения по ID, создания, редактирования и изменения
статуса содержат `stats` для каждого канала:

```json
{
  "stats": { "views": 150, "formOpens": 30, "bookings": 10 }
}
```

Это итоговые значения за всё время. Отдельного endpoint для чтения статистики нет.
Публичные ответы статистику не раскрывают. Отсутствующие счётчики возвращаются как `0`.
`views` и `formOpens` начинают накапливаться после подключения событий на frontend;
`bookings` включает уже существующие записи канала.

- `views` - показы публичной страницы или виджета (встроенной формы либо кнопки запуска).
- `formOpens` - нажатия кнопки открытия формы. Повторное открытие считается снова.
  Автоматический показ постоянно видимой встроенной формы не считается открытием.
- `bookings` - число созданных записей с `bookingPageId` или `bookingWidgetId`,
  включая отменённые и мягко удалённые. Одна запись с несколькими услугами считается один раз.
  Жёсткое удаление записи уменьшит этот показатель, поскольку он вычисляется из `Booking`.

Для регистрации событий:

| Канал    | Метод и путь                                     |
| -------- | ------------------------------------------------ |
| Страница | `POST /public/booking-pages/{pageId}/events`     |
| Виджет   | `POST /public/booking-widgets/{widgetId}/events` |

Тело: `{ "event": "VIEW" }` или `{ "event": "FORM_OPEN" }`. Значение счётчика,
дату, sessionId или событие создания записи передавать не нужно. Успех: `200` и
`BaseResponseDto` с `responseValue: null`. Каждое принятое событие увеличивает один
счётчик на `1`. События не хранятся и не дедуплицируются; автоматически повторять
запрос после неопределённого сетевого результата не следует.

Не отправлять события из редактора/предпросмотра, при SSR, prefetch, повторном
рендере или обновлении данных. `VIEW` отправлять один раз при фактическом показе,
после перезагрузки допустим новый просмотр. Если форма уже видна на десктопе,
сам показ не увеличивает `formOpens`. Ошибка отправки не должна мешать записи.
Сбор этих счётчиков не зависит от заполнения GTM-ID или ID Метрики.

Принимаются только опубликованные каналы активных филиалов; иначе `404`.
Для виджета проверяется `allowedDomains` по Origin/Referer, как в публичном GET;
запрещённый домен даёт `403`. Защита от частых запросов: `120` событий в минуту
на IP суммарно для обоих endpoint в пределах одного процесса API, затем `429`
с кодом `BOOKING_CHANNEL_EVENTS_RATE_LIMITED`. При нескольких репликах лимит не общий.

В БД одна строка `BookingPageStats` на страницу или `BookingWidgetStats` на виджет,
создаётся первым событием. Обновление атомарное; `updatedAt` самого канала не меняется.
При удалении канала его счётчики удаляются каскадно. История, периоды, уникальные
посетители и сессии не сохраняются.

## Общая конфигурация формы

В запросах и административных ответах конфигурация находится в `form`.
В публичных ответах страниц и виджетов — в `config`. Оба используют одну схему:

```ts
type BookingFormConfig = {
  paletteId: BookingPalette;
  customPalette: BookingPaletteTokens | null;
  headline: string;
  caption: string;
  showStaff: boolean;
  showBranding: boolean;
};

type BookingPaletteTokens = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
};

type BookingFormTheme = BookingPaletteTokens & { line: string };
```

`buttonLabel` и `showServiceImages` удалены. Текст кнопок определяет интерфейс
по шагу записи; фотографии услуг показываются при наличии.

Для готовой темы отправлять `paletteId` и `customPalette: null`. Для `CUSTOM`
обязательны все шесть цветов в формате `#RRGGBB`. Цвета нормализуются в верхний
регистр. `line` отправлять не требуется: backend вычисляет его из `text`
с прозрачностью 0.14. Неизвестный `paletteId` даёт 400.

Все административные и публичные ответы содержат готовую `theme` рядом с
`form`/`config`. Для готовых тем `line` берётся из каталога: у разных тем его
прозрачность может отличаться. Не пересчитывать готовые темы на frontend.

## Каталог

GET `/booking-channels/palettes` требует обычную авторизацию Bearer. Идентификатор
бренда/филиала и отдельное разрешение не нужны. Стандартная оболочка API:

```ts
type BookingPaletteCatalogResponse = {
  isSuccess: boolean;
  responseCode: string;
  responseMessage: string;
  responseValue: {
    defaultPaletteId: BookingPalette;
    presets: Array<{
      id: BookingPalette;
      label: string;
      description: string;
      theme: BookingFormTheme;
    }>;
  };
};
```

Начальная тема — `INK`. Использовать значение `defaultPaletteId` из ответа,
не закреплять его в клиенте. `CUSTOM` отсутствует в `presets`.

Порядок: `INK`, `SAND`, `SAGE`, `DUSK`, `WINE`, `PEARL`, `GRAPHITE`, `EMERALD`,
`SKY`, `LAVENDER`, `CORAL`, `MONO`, `BLUSH`, `LAGOON`, `HONEY`, `COCOA`, `RUBY`,
`MIST`, `OLIVE`, `INDIGO`, `APRICOT`, `PINE`.

Русские `label` и `description`, порядок и цвета перенесены из
`crm-frontend/src/entities/booking-form/model/palettes.ts`;
прежний `caption` каталога называется `description`.

## Публичный каталог товаров

Каталог товаров входит в общий setup и доступен без авторизации:

- GET `/public/locations/{locationId}/booking-setup`: `responseValue.products`.
- GET `/public/booking-pages/{slug}`: `responseValue.setup.products`.
- GET `/public/booking-widgets/{widgetId}`: `responseValue.setup.products`.

Frontend использует каталог из ответа страницы или виджета. Прежний эндпоинт
`/public/locations/{locationId}/product-catalog` удалён.

Поле `products` всегда содержит:

```ts
{
  categories: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
  items: Array<{
    productId: string;
    name: string;
    description: string | null;
    categoryId: string | null;
    image: { id: string; name: string; url: string } | null;
    unit: ProductUnit;
    retailPrice: string;
  }>;
}
```

`retailPrice` — розничная цена филиала за базовую единицу товара, десятичная
строка с двумя знаками после точки. Валюта берётся из `location.currency`.
Описания выводятся как обычный текст. Для товара без фотографии или категории
соответствующее поле равно `null`.

Возвращаются все активные товары бренда, подключённые к этому филиалу в активном
статусе. Проверка соответствует текущему правилу доступности продажи: наличие
на складе не проверяется. Каталог не резервирует товары и не оформляет покупку.
Служебные поля товара и склада в ответ не включаются.

`categories` содержит только категории представленных товаров, без повторов,
в порядке `sortOrder`, названия и ID. `items` отсортирован по названию и ID товара.
Товары без категории остаются в `items` с `categoryId: null`. Пагинации нет.
Пустой каталог возвращает `categories: []` и `items: []`.
Отсутствующий/удалённый филиал или удалённый бренд дают 404; некорректный UUID — 400.

## Переход frontend

1. Обновить API-типы по OpenAPI; добавить обязательный nullable `heading`
   в создание и редактирование страницы. Удалить две устаревшие настройки.
2. Получать каталог один раз для редакторов страниц и виджетов. Показывать
   темы в порядке `presets`, использовать серверные подписи и `theme` для превью.
3. Новые страницы и виджеты инициализировать через `defaultPaletteId`.
4. При переходе на CUSTOM копировать шесть цветов из текущей `theme`.
   Для мгновенного превью CUSTOM можно вычислять `line` как
   `rgba(r,g,b,0.14)` из `text`; сохранённый ответ содержит готовую тему.
5. Публичная страница и внешний виджет используют `theme` своего ответа;
   запрос каталога им не нужен. Удалить локальные определения готовых палитр
   и замену неизвестного кода первой темой.
6. Нейтральное светлое окружение формы задаётся frontend. Серверная палитра
   описывает саму форму записи.
7. Товары и их категории читать из `setup.products` ответа страницы или виджета.
   Удалить отдельный запрос `product-catalog`. В самостоятельном ответе
   `booking-setup` каталог находится в `responseValue.products`.

Перед развёртыванием применить миграцию `20261022120000_booking_channel_contract`:
она добавляет `BookingPage.heading`, удаляет старые колонки обеих моделей и
расширяет enum десятью темами, ранее существовавшими только на frontend.
Обратной совместимости со старым контрактом нет.
