# Контракт страниц и виджетов онлайн-записи

OpenAPI: [booking-channels.openapi.json](./booking-channels.openapi.json).
Схема генерируется из контроллеров и DTO: `npm run build`, затем
`node scripts/export-booking-channels-openapi.mjs`. В работающем API полный
контракт доступен по `/api-json`, Swagger UI — `/api`.

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

GET `/public/locations/{locationId}/product-catalog` доступен без авторизации.
Frontend берёт `locationId` из ответа страницы и загружает каталог отдельным
запросом. Каталог не добавляется в `booking-setup` или в ответ страницы.

В стандартной оболочке API `responseValue` содержит:

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

Перед развёртыванием применить миграцию `20261022120000_booking_channel_contract`:
она добавляет `BookingPage.heading`, удаляет старые колонки обеих моделей и
расширяет enum десятью темами, ранее существовавшими только на frontend.
Обратной совместимости со старым контрактом нет.
