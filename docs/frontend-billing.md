# Frontend: тарифы и подписки

Контракты сверены с backend на 2026-11-15 (повторно после рефакторинга модуля биллинга: пути и формы ответов не менялись, исправлены неточности документа). Реализованы фазы 1–4 [плана подписок](./subscriptions-plan.md): тарифы и цены, публичный API цен, подписка бренда с триалом, офлайн-оплата с подтверждением админом, смена тарифа, лимиты, блокировка онлайн-записи, напоминания и письма, админка платформы. Онлайн-оплата (bePaid) и автопродление пока не подключены, но контракт под них уже готов (`nextAction`, раздел 6).

Документ описывает, **что** отдаёт API и **какую логику** нужно повторить на фронтенде. Вёрстку, тексты (кроме обязательных из раздела 8), компоненты и расположение экранов фронтенд выбирает сам. Предложения по экранам ниже только ориентир.

Читать вместе с актуальной OpenAPI `/api-json` (схемы и все варианты `nextAction`) и [словарём permissions](./frontend-permissions.json) (новый claim `billing`).

## 1. Что сделано на backend

| Что | Где на фронтенде |
| --- | --- |
| Тарифы и цены по странам в БД, версии цен с датой начала | Админка платформы: «Тарифы» |
| `GET /public/billing/plans` без авторизации | Маркетинговая `/pricing` вместо констант `TARIFFS` |
| Подписка бренда: триал 30 дней, состояния `TRIAL / ACTIVE / PAST_DUE / EXPIRED / SUSPENDED` | Баннер в `DashboardShell`, страница блокировки, раздел «Подписка» |
| Запрос на продление `KL-000123` с зафиксированной суммой, подтверждает админ | Раздел «Подписка», админка «Платежи» |
| Смена тарифа с пересчётом остатка в дни | Раздел «Подписка» |
| Лимиты сотрудников и филиалов, мягкое превышение | Обработка `409` при создании сотрудника и филиала |
| Онлайн-запись закрывается для заблокированного бренда | Публичная запись |
| Письма владельцу и админу (напоминания, заявка, оплата) | Ссылки ведут в `/app/brands/:brandId/billing` и `/admin/billing/payments?search=KL-…` |
| Новый claim `billing` (только OWNER), `PERMISSIONS_VERSION = 3` | Видимость раздела «Подписка» |

**Биллинг включён всегда.** Отдельного запуска нет: каждый новый бренд получает подписку с триалом при создании. На stage у брендов, существовавших на 2026-11-15, триал до 2026-12-15. Бренд без подписки (например, созданный сидом) — в состоянии `FREE`: баннеров, лимитов и блокировок нет, в `subscription-states` его нет. Фронтенд должен корректно показывать и такой бренд.

Блокировка и лимиты дополнительно включаются флагом `enforcementEnabled` в настройках. Пока он выключен, `isBlocked` всегда `false`, а лимиты не проверяются, но состояние, даты и баннеры уже работают.

## 2. Общие правила API

- Ответы в `BaseResponseDto`: `{ isSuccess, responseCode, responseMessage, responseValue }`. Ошибки: `isSuccess: false`, `responseCode` — код из раздела 9, `responseValue` — данные ошибки или `null`.
- **Деньги — строки** с двумя знаками: `"29.00"`. Валюта отдельным полем (`"BYN"`). Не считать деньги в `number`, только форматировать.
- **Даты — ISO UTC.** Концы периодов (`trialEndsAt`, `paidUntil`, `accessEndsAt`, `graceEndsAt`) **исключающие**: это полночь следующего дня в часовом поясе бренда. Для текста «доступ до 13 декабря включительно» использовать готовое поле `lastAccessDate` (`"2026-12-13"`, локальная дата бренда), а не форматировать `accessEndsAt` самостоятельно.
- `daysLeft` — уже посчитанные календарные дни в поясе бренда: в `TRIAL`/`ACTIVE` до `accessEndsAt`, в `PAST_DUE` до `graceEndsAt`, иначе `null`. Никогда не отрицательное.
- Пагинация — стандартные `page`, `pageSize`, `orderBy`, `orderDirection`, `isExport`. Ответ `{ items, page, totalItems, totalPages, isExport }`: `pageSize` в ответе нет, брать из запроса.
- Массивы в query передаются повторением ключа: `?state=PAST_DUE&state=EXPIRED`.

## 3. Права и видимость

| Кто | Что доступно |
| --- | --- |
| Любой вошедший пользователь | `GET /users/me/subscription-states`, `GET /users/me/trial-eligibility` |
| OWNER бренда (`billing:read`) | Чтение раздела «Подписка» |
| OWNER бренда (`billing:write`) | Создание и отмена заявок, смена тарифа |
| Админ платформы (`UserRole.ADMIN`) | Всё под `/admin/billing/*` |

`billing` — claim области бренда (`B:<brandId>`), не настраивается в «Правах ролей» и есть только у OWNER. Пункт меню «Подписка» показывать по `permissions['B:'+brandId]?.billing`, как остальные claims (см. [управление доступом](./frontend-access-management.md)). Не вычислять его из роли.

После обновления backend `PERMISSIONS_VERSION` вырос до 3: запросы со старым access-токеном получат `409 TOKEN_PAYLOAD_STALE`, и существующая обработка этой ошибки обновит токен через refresh. Отдельно ничего делать не нужно.

## 4. Публичные цены (маркетинг)

`GET /public/billing/plans?country=BY` — без авторизации, rate limit как у других публичных ручек, `Cache-Control: public, max-age=300, stale-while-revalidate=600`.

```ts
{
  country: 'BY',               // запрошенная страна (или defaultCountryCode)
  pricingCountry: 'BY',        // чьи цены отданы: страна без своих цен получает цены BY
  currency: 'BYN',
  trialDays: 30,
  yearlyDiscountPercent: 17,   // максимальная скидка за год среди тарифов, null — нет годовых цен
  plans: [
    {
      code: 'master', name: 'Мастер', position: 1, pricingMode: 'STANDARD',
      staffLimit: 1, locationLimit: 1,
      prices: {
        MONTH: { amount: '29.00', monthlyAmount: '29.00', discountPercent: null },
        YEAR:  { amount: '290.00', monthlyAmount: '24.17', discountPercent: 17 },
      },
      upcomingPrices: [{ billingPeriod: 'MONTH', amount: '35.00', effectiveFrom: '2027-01-01T...' }],
    },
    { code: 'network', name: 'Сеть', position: 3, pricingMode: 'CUSTOM',
      staffLimit: null, locationLimit: null, prices: null, upcomingPrices: [] },
  ],
}
```

- Только активные публичные тарифы, уже отсортированы по `position`.
- `staffLimit` / `locationLimit` = `null` — без ограничений.
- `pricingMode: 'CUSTOM'` (`prices: null`) — «индивидуально», кнопка «Связаться» на `sales@klendo.by`.
- Описания и списки преимуществ тарифов остаются на фронтенде, ключ — `code`. Округление «от 24 BYN» — на фронтенде.
- `upcomingPrices` можно показать как «с 1 января — 35 BYN» или не показывать.
- Неверный формат `country` → `400`. Сайт пока всегда передаёт `BY`.

**Кэш.** Next.js: серверный `fetch` с `{ next: { revalidate: 300, tags: ['billing-plans'] } }`. Если backend недоступен при сборке, оставить запасные `TARIFFS` и предупреждение в логе сборки.

## 5. CRM: состояние подписки

### 5.1 Состояния

| `state` | Что значит | Доступ |
| --- | --- | --- |
| `FREE` | У бренда нет подписки (например, создан сидом) | Полный, ничего не показывать |
| `TRIAL` | Пробный период | Полный, лимитов нет |
| `ACTIVE` | Оплачено | Полный, лимиты тарифа |
| `PAST_DUE` | Оплата закончилась, идут льготные дни (3 дня, плюс 3 дня при открытой заявке) | Полный, красный баннер |
| `EXPIRED` | Льготные дни прошли | Блокировка (если `isBlocked`) |
| `SUSPENDED` | Админ приостановил вручную | Блокировка (если `isBlocked`) |

Состояние вычисляется на backend при каждом запросе. Решать «заблокирован ли бренд» по `isBlocked`, а не по `state`: он учитывает `enforcementEnabled`.

### 5.2 Список состояний для баннера и блокировки

`GET /users/me/subscription-states` — массив по всем брендам пользователя из токена. Бренды в `FREE` не возвращаются: нет элемента — нет баннера и блокировки.

```ts
[{
  brandId: string,
  state: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'SUSPENDED',
  isBlocked: boolean,
  accessEndsAt: string,         // в OpenAPI nullable (общая схема), в этом списке всегда заполнено
  lastAccessDate: '2026-12-13',
  graceEndsAt: string,          // то же
  daysLeft: number | null,
  overLimit: boolean,          // использование выше лимитов тарифа
  hasPendingPayment: boolean,  // открыт запрос на продление
  isOwner: boolean,            // показывать ли «Продлить» и действия владельца
}]
```

Этого хватает для баннера и страницы блокировки без прав `billing` (их видят и управляющие, и сотрудники). TanStack Query: `staleTime` 1 минута, инвалидировать после действий в разделе «Подписка» и после смены бренда.

### 5.3 Баннер в `DashboardShell`

Логика (тексты и вид — на усмотрение фронтенда):

| Условие | Владелец (`isOwner`) | Управляющий и сотрудник |
| --- | --- | --- |
| `hasPendingPayment` | «Запрос отправлен, мы свяжемся с вами. Доступ сохранится до {lastAccessDate}» (в `PAST_DUE` — до {graceEndsAt}) | — |
| `TRIAL`, `daysLeft <= 7` | «Пробный период заканчивается через {daysLeft} дн.» + «Выбрать тариф» | — |
| `ACTIVE`, `daysLeft <= 7` | «Подписка заканчивается {lastAccessDate}» + «Продлить» | — |
| `PAST_DUE` | Красный: «Подписка закончилась» + «Продлить», работа приостановится с даты `graceEndsAt` | «Подписка бренда закончилась. Обратитесь к владельцу, иначе с {graceEndsAt} работа будет приостановлена» |
| `overLimit` | «Сотрудников/филиалов больше, чем позволяет тариф. Добавить новых нельзя» + «Сменить тариф» | — |

Порог 7 дней — рекомендация, совпадает с первым напоминанием на почту.

`graceEndsAt` — первый день без доступа (полночь в поясе бренда), готовой локальной даты для него нет. Форматировать как дату в поясе бренда («работа приостановится с 16 декабря»), а не в поясе браузера, иначе у пользователя в другом поясе дата съедет на день.

### 5.4 Страница блокировки

Если у текущего бренда `isBlocked`, layout бренда рендерит **страницу вместо дочерних маршрутов** и не запрашивает данные кабинета. Не делать модальное окно поверх кабинета: его легко убрать в DevTools.

- **Владелец, `EXPIRED`:** «Подписка закончилась {lastAccessDate}. Все данные сохранены». Тот же компонент выбора тарифа и оплаты, что в разделе «Подписка» (раздел 6). Если заявка уже есть, показать её и «Мы свяжемся с вами». Кнопки «Выгрузить клиентов» и «Выгрузить записи»: экспорт продолжает работать.
- **Управляющий и сотрудник:** «Работа в кабинете приостановлена. Обратитесь к владельцу бренда».
- **`SUSPENDED`:** «Доступ приостановлен. Свяжитесь с поддержкой: support@klendo.by». Причину (`suspendReason`) владелец видит в `GET /brands/:brandId/subscription`.
- Переключатель брендов остаётся доступным.

Backend API кабинета **не закрывает**: блокирует только фронтенд. Единственное ограничение на backend — онлайн-запись (раздел 7).

## 6. CRM: раздел «Подписка» (только OWNER)

Маршрут `/app/brands/:brandId/billing`: на него ведут ссылки из писем владельцу (`{FRONTEND_DOMAIN}/app/brands/:brandId/billing`). Если маршрут будет другим, поменять `BillingLinkService.billing`.

### 6.1 Ручки

| Метод | Путь | Права | Ответ |
| --- | --- | --- | --- |
| GET | `/brands/:brandId/subscription` | `billing:read` | Полное состояние (6.2) |
| GET | `/brands/:brandId/subscription/payment-quote?planCode&billingPeriod` | `billing:read` | Расчёт оплаты (6.3) |
| POST | `/brands/:brandId/subscription/payments` | `billing:write` | Тело `{ planCode, billingPeriod, comment? }` → `{ payment, nextAction }` |
| GET | `/brands/:brandId/subscription/payments` | `billing:read` | История заявок и оплат, пагинация, `orderBy`: `createdAt` / `number` / `paidAt` |
| GET | `/brands/:brandId/subscription/payments/:id` | `billing:read` | `{ payment, nextAction }` |
| POST | `/brands/:brandId/subscription/payments/:id/cancel` | `billing:write` | Отмена своей `PENDING` заявки → `payment` |
| GET | `/brands/:brandId/subscription/plan-change-quote?planCode` | `billing:read` | Расчёт смены тарифа (6.5) |
| POST | `/brands/:brandId/subscription/plan-change` | `billing:write` | Тело `{ planCode }` → полное состояние |
| GET | `/brands/:brandId/subscription/events` | `billing:read` | Журнал событий, пагинация |

### 6.2 Полное состояние

```ts
{
  state: 'FREE' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'SUSPENDED',
  isBlocked: boolean,
  plan: { code, name, pricingMode, staffLimit, locationLimit } | null, // null в триале до выбора
  billingPeriod: 'MONTH' | 'YEAR' | null,
  countryCode: 'BY', pricingCountry: 'BY', currency: 'BYN',
  trialEndsAt, paidUntil, accessEndsAt, graceEndsAt: string | null,
  lastAccessDate: string | null,
  daysLeft: number | null,
  suspendReason: string | null,
  limits: { staff: number | null, locations: number | null }, // действующие сейчас, null — без лимита
  usage: { staff: number, locations: number },
  overLimit: boolean,
  needsCustomPlan: boolean,       // ни один стандартный тариф не вмещает бренд → «Сеть», sales@klendo.by
  pendingPayment: SubscriptionPayment | null,
  customPrices: { currency, MONTH: string | null, YEAR: string | null } | null, // для тарифа CUSTOM
  enforcementEnabled: boolean,
}
```

Список тарифов для выбора брать из `GET /public/billing/plans?country={countryCode}` (TanStack Query, `staleTime` 10 минут). Текущий тариф — по `plan.code`. В триале лимиты не действуют (`limits.staff` и `limits.locations` = `null`), но тариф, который не вмещает `usage`, оплатить нельзя: это показывает `payment-quote`.

### 6.3 Оплата (запрос на продление)

1. Владелец выбирает тариф и период. Фронтенд запрашивает `payment-quote`:

   ```ts
   {
     plan: { code, name, ... }, billingPeriod: 'YEAR',
     countryCode: 'BY', currency: 'BYN', amount: '290.00',
     periodStart: string, periodEnd: string, // какой период оплачивается при оплате сегодня
     limits: { staff, locations }, usage: { staff, locations },
     fits: boolean,    // тариф вмещает текущее использование
     allowed: boolean, // можно ли создать заявку
   }
   ```

   `allowed = fits || isBlocked`: заблокированный бренд может оплатить даже тариф меньше использования (превышение останется мягким), остальные — нет. При `fits: false` показать, чего не хватает (`limits` против `usage`), и предложить больший тариф или «Сеть».

   Дни триала не сгорают: при оплате в триале `periodStart` = конец триала.

2. «Отправить запрос» → `POST .../payments` с телом `{ planCode, billingPeriod, comment? }` (`comment` вернётся в платеже как `ownerComment`). Ответ `{ payment, nextAction }`. Сумма и номер зафиксированы в заявке и не меняются при изменении цен.

3. Обработать `nextAction` по `type`, **не по провайдеру**:

   ```ts
   type PaymentNextAction =
     | { type: 'INSTRUCTIONS'; instructions: string | null; reference: string; amount: string; currency: string; expiresAt: string | null }
     | { type: 'REDIRECT'; url: string; expiresAt: string | null }
     | { type: 'NONE' };
   ```

   - `INSTRUCTIONS` (сейчас всегда, офлайн-оплата): показать «Запрос {reference} отправлен. **Мы свяжемся с вами**». Если `instructions` не `null`, показать их как есть (позже там будут реквизиты). Контакты для вопросов: support@klendo.by.
   - `REDIRECT` (будущая онлайн-оплата): `window.location.href = url`. После возврата перечитать `GET .../payments/:id`.
   - `NONE`: платёж уже не ждёт действий (оплачен, отменён, истёк), показать его статус.

   Неизвестный `type` трактовать как `NONE`, чтобы новые провайдеры не ломали старый фронтенд.

4. Пока заявка открыта, `pendingPayment` заполнен: показывать её вместо формы оплаты, с кнопкой «Отменить заявку». Открытая заявка одна: новая заявка автоматически отменяет предыдущую (`failureReason: 'replaced'`).

Открытая заявка один раз продлевает льготный период ещё на 3 дня, поэтому `graceEndsAt` может сдвинуться после отправки. Перечитать состояние и `subscription-states` после создания и отмены.

**Платёж** (`SubscriptionPayment`):

```ts
{
  id, number: 123, displayNumber: 'KL-000123',
  planName, billingPeriod, countryCode, currency, amount,
  provider: 'OFFLINE' | 'COMPLIMENTARY',
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED' | 'EXPIRED',
  method: 'BANK_TRANSFER' | 'ERIP' | 'CASH' | 'CARD' | 'OTHER' | 'NONE' | null,
  reference: string | null, failureReason: string | null, ownerComment: string | null,
  expiresAt, paidAt, periodStart, periodEnd: string | null,
  createdAt: string,
  createdByRole: 'OWNER' | 'ADMIN' | 'SYSTEM' | 'PROVIDER',
}
```

- `COMPLIMENTARY` — дни, подаренные поддержкой (сумма `0.00`).
- `EXPIRED` — заявка не оплачена за `paymentRequestTtlDays` (по умолчанию 14 дней) и закрыта автоматически (крон раз в час). Срок конкретной заявки — её `expiresAt`.
- `failureReason` у отменённых: `canceled_by_owner`, `canceled_by_admin`, `replaced` (создана новая заявка), `plan_changed` (тариф сменили, и заявка по старому тарифу закрыта), `brand_deleted`. Для подписи в истории.

### 6.4 История событий

`GET .../events` → страница `{ items: [{ id, type, actorRole, payload, createdAt }], page, totalItems, totalPages }`, `orderBy`: только `createdAt`. `type` из `SubscriptionEventType` (`TRIAL_STARTED`, `PAYMENT_CREATED`, `PAYMENT_APPLIED`, `PLAN_CHANGED`, `PERIOD_EXTENDED`, `SUSPENDED`, `RESUMED` и т. д.). `payload` — свободный объект, полезен для деталей (номер платежа, даты). Внутренних заметок админа в нём нет. Показывать необязательно: это для «Истории» внизу раздела.

### 6.5 Смена тарифа

Только при оплаченном остатке (`paidUntil` в будущем) и только между стандартными публичными тарифами. Остаток пересчитывается в дни нового тарифа, доплат и возвратов нет.

1. `GET .../plan-change-quote?planCode=team`:

   ```ts
   { plan, billingPeriod, paidUntilBefore, paidUntilAfter, limits, usage, fits }
   ```

   Показать «Оплачено до {paidUntilBefore} → станет до {paidUntilAfter}». При `fits: false` смену не предлагать.

2. `POST .../plan-change` `{ planCode }` → новое полное состояние.

В триале или без оплаченного остатка тариф «меняется» выбором в форме оплаты (6.3), а не этой ручкой. Тариф `CUSTOM` («Сеть») меняет только поддержка: `SUBSCRIPTION_PLAN_MANAGED_BY_SUPPORT`.

### 6.6 Триал второго бренда

Триал один на пользователя. Перед созданием бренда (онбординг, «Добавить бренд») можно запросить `GET /users/me/trial-eligibility` → `{ eligible, usedInBrandName }`. При `eligible: false` предупредить: «Пробный период уже использован в бренде {usedInBrandName}. Новый бренд нужно будет оплатить» — такой бренд сразу появляется в `PAST_DUE` с льготными днями. Создание бренда это не блокирует.

## 7. Лимиты и публичная запись

### 7.1 Лимиты при создании сотрудника и филиала

Создание сотрудника, смена его статуса на `ACTIVE` и создание филиала могут вернуть `409`:

```ts
// PLAN_STAFF_LIMIT_REACHED | PLAN_LOCATION_LIMIT_REACHED
responseValue: {
  resource: 'STAFF' | 'LOCATION',
  limit: number, used: number,
  planCode: string | null,
  suggestedPlanCode: string | null, // ближайший подходящий тариф; null → «Сеть», sales@klendo.by
}
```

Показать «В тарифе {название} — {limit} мест, занято {used}» (название по `planCode` из публичного списка тарифов; `planCode: null` — тариф не выбран). Владельцу — кнопка «Сменить тариф» в раздел «Подписка» с предвыбранным `suggestedPlanCode`. Остальным — «Обратитесь к владельцу бренда». Можно заранее блокировать кнопки «Добавить» по `limits`/`usage`, но backend всё равно проверит.

В триале, в `FREE` и при выключенном `enforcementEnabled` лимитов нет. Превышение мягкое: всё уже созданное продолжает работать, нельзя только добавлять новое.

### 7.2 Онлайн-запись

- `GET` настройки публичной записи (booking setup) отдаёт новое поле `isOnlineBookingAvailable: boolean`.
- При `false` не показывать форму записи. Текст: «Онлайн-запись временно недоступна. Запишитесь по телефону» и контакты филиала. **Ни слова о неоплате** — это видят клиенты салона.
- Если бренд заблокировали, пока клиент заполнял форму, создание записи вернёт `403 ONLINE_BOOKING_UNAVAILABLE`: показать тот же текст.
- Отмена и перенос по ссылке из письма работают как раньше.

## 8. Обязательные тексты и контакты

- После создания заявки: «**Мы свяжемся с вами**». Юрлица пока нет, поэтому реквизитов нет; когда появятся, они придут в `nextAction.instructions` без изменений фронтенда.
- Вопросы по оплате и `SUSPENDED`: **support@klendo.by**.
- Тариф «Сеть», `needsCustomPlan`, `suggestedPlanCode: null`: **sales@klendo.by**.
- Клиентам салона (публичная запись) — никаких упоминаний подписки.

Остальные тексты, тон, иконки и цвета — на усмотрение фронтенда.

## 9. Коды ошибок

| Код | HTTP | Когда показывается владельцу / админу | `responseValue` |
| --- | --- | --- | --- |
| `PLAN_STAFF_LIMIT_REACHED` | 409 | Нет свободного места сотрудника | `{ resource, limit, used, planCode, suggestedPlanCode }` |
| `PLAN_LOCATION_LIMIT_REACHED` | 409 | Нет свободного филиала | то же |
| `PLAN_USAGE_EXCEEDS_LIMITS` | 409 | Оплата или смена на тариф, который не вмещает использование | `{ staff: { limit, used }, locations: { limit, used } }` |
| `BILLING_PLAN_NOT_AVAILABLE` | 409 | Тариф архивный, непубличный или `CUSTOM` | — |
| `BILLING_PLAN_PRICE_MISSING` | 409 | У тарифа нет цены в стране бренда | — |
| `SUBSCRIPTION_NOT_STARTED` | 409 | Действие в `FREE` (у бренда нет подписки) | — |
| `SUBSCRIPTION_NO_PAID_PERIOD` | 409 | Смена тарифа без оплаченного остатка | — |
| `SUBSCRIPTION_PLAN_MANAGED_BY_SUPPORT` | 409 | Владелец меняет тариф `CUSTOM` | — |
| `SUBSCRIPTION_PAYMENT_NOT_CANCELABLE` | 409 | Заявка уже не `PENDING` | `{ status }` |
| `ONLINE_BOOKING_UNAVAILABLE` | 403 | Публичная запись заблокированного бренда | — |
| `BILLING_PLAN_CODE_EXISTS` | 409 | Админ: дубликат `code` | — |
| `BILLING_PLAN_LAST_PUBLIC` | 409 | Админ: архивация последнего публичного стандартного тарифа | — |
| `BILLING_PRICE_EFFECTIVE_FROM_PAST` | 400 | Админ: `effectiveFrom` в прошлом | — |
| `BILLING_PRICE_ALREADY_EFFECTIVE` | 409 | Админ: удаление уже действующей версии цены | — |
| `BILLING_PRICE_CURRENCY_MISMATCH` | 400 | Админ: валюта не как у страны | `{ countryCode, currency }` |
| `BILLING_PROVIDER_NOT_AVAILABLE` | 400 | Админ: провайдер без реализации или конфига | `{ provider }` |
| `SUBSCRIPTION_PAYMENT_NOT_CONFIRMABLE` | 409 | Админ: уже `PAID` или не `OFFLINE` | `{ status, provider }` |
| `SUBSCRIPTION_PAYMENT_DATE_INVALID` | 400 | Админ: `paidAt` в будущем или раньше заявки | — |
| `SUBSCRIPTION_PLAN_REQUIRED` | 409 | Админ: продление без тарифа у подписки | — |
| `SUBSCRIPTION_ALREADY_EXISTS` | 409 | Админ: старт подписки для бренда, у которого она уже есть | — |

Не найдено — обычный `404`. Ошибки валидации — стандартный `400`; так же, без отдельного кода, отвечают «сумма должна быть больше 0» (`…/payments` админа), «ровно одно из `days` и `until`» (`…/extend`) и «`trialEndsOn` в прошлом» (`…/start`).

## 10. Админка платформы

Все ручки `admin/billing/*`: только `UserRole.ADMIN`, `Cache-Control: no-store`. Не кэшировать в TanStack Query дольше открытого экрана. Предлагаемые экраны:

### 10.1 «Тарифы»

| Метод | Путь | Тело / query | Ответ |
| --- | --- | --- | --- |
| GET | `/admin/billing/plans` | — | `[{ id, code, name, position, status, isPublic, pricingMode, staffLimit, locationLimit, subscriptions, currentPrices[], upcomingPrices[], createdAt, updatedAt }]` |
| POST | `/admin/billing/plans` | `{ code, name, position, isPublic, pricingMode, staffLimit, locationLimit }` | тариф |
| PATCH | `/admin/billing/plans/:id` | `{ name?, position?, isPublic?, staffLimit?, locationLimit? }` | тариф + `overLimitSubscriptions` — сколько подписок окажутся в превышении |
| POST | `/admin/billing/plans/:id/archive` | — | тариф |
| POST | `/admin/billing/plans/:id/restore` | — | тариф |
| GET | `/admin/billing/plans/:id/prices?countryCode=` | — | все версии цен `[{ id, countryCode, currency, billingPeriod, amount, effectiveFrom, createdById, createdAt }]` |
| POST | `/admin/billing/plans/:id/prices` | `{ countryCode, billingPeriod, amount, currency?, effectiveFrom? }` | цена |
| DELETE | `/admin/billing/plans/:id/prices/:priceId` | — | `204`, только будущая версия |
| GET | `/admin/billing/countries` | — | `[{ countryCode, currency, plansWithPrices, subscriptions }]` |

Тарифы не удаляются, только архивируются. Изменение цены — новая версия с датой начала; без `effectiveFrom` действует сразу. Уже созданные заявки и оплаченные периоды не меняются. При `overLimitSubscriptions > 0` стоит показать предупреждение после сохранения.

### 10.2 «Настройки»

`GET` / `PUT /admin/billing/settings` → один плоский объект: поля настроек и `providers`.

Поля: `defaultCountryCode`, `trialDays`, `graceDays`, `reminderDaysBefore` (например `[7, 3, 1]`), `paymentProvider`, `paymentRequestTtlDays`, `pendingRequestGraceDays`, `offlinePaymentInstructions` (текст в `nextAction.instructions`), `adminNotifyEmail` (кому письма о новых заявках), `enforcementEnabled`, а также только для чтения `updatedAt`.

`providers`: `[{ code, ownerInitiated, adminConfirmable, webhooks, statusPolling, recurring }]` — варианты для выбора `paymentProvider`. `PUT` принимает все поля настроек целиком (не частично), кроме `updatedAt` и `providers`. По умолчанию: `trialDays` 30, `graceDays` 3, `reminderDaysBefore` `[7, 3, 1]`, `paymentRequestTtlDays` 14, `pendingRequestGraceDays` 3, `enforcementEnabled` `false`.

### 10.3 «Подписки»

| Метод | Путь | Тело | Ответ |
| --- | --- | --- | --- |
| GET | `/admin/billing/subscriptions` | query: `state[]`, `planCode[]`, `countryCode[]`, `accessEndsBefore`, `accessEndsAfter`, `hasPendingPayment`, `overLimit`, `needsCustomPlan`, `search` (бренд или email владельца), `orderBy`: `accessEndsAt` / `createdAt` | страница `AdminSubscriptionItem` |
| POST | `/admin/billing/subscriptions/extend-trials` | `{ until, reason, dryRun? }` | `{ count, dryRun }` — сначала вызвать с `dryRun: true` и показать подтверждение «Будет продлено N брендов» |
| GET | `/admin/billing/subscriptions/:brandId` | — | карточка (ниже) |
| POST | `…/:brandId/start` | `{ trialEndsOn: 'YYYY-MM-DD' }` | карточка; старт подписки бренду без неё (`FREE`) |
| POST | `…/:brandId/extend-trial` | `{ days, reason }` | карточка |
| POST | `…/:brandId/extend` | `{ days \| until, reason }` | карточка; подарить дни (`COMPLIMENTARY`) |
| POST | `…/:brandId/payments` | `{ planCode, billingPeriod, amount, currency, paidAt, method, reference?, adminNote? }` | карточка; зачесть оплату без заявки |
| PUT | `…/:brandId/plan` | `{ planCode, billingPeriod?, customStaffLimit?, customLocationLimit?, customCurrency?, customMonthlyPrice?, customYearlyPrice?, convertRemaining, reason }` | карточка |
| PUT | `…/:brandId/country` | `{ countryCode, reason }` | карточка |
| POST | `…/:brandId/suspend` | `{ reason }` | карточка |
| POST | `…/:brandId/resume` | — | карточка |

**Даты в формах админа.** `until` (`extend-trials`, `…/extend`) и `trialEndsOn` (`…/start`) — календарные даты `YYYY-MM-DD` в часовом поясе бренда, и это **первый день без доступа** (исключающая граница, как `accessEndsAt`). Если в форме админ выбирает «доступ по 31 декабря включительно», отправлять `2027-01-01`. Подписать поле так, чтобы это было понятно, или прибавлять день на фронтенде. `paidAt` — ISO-дата-время, не в будущем и не раньше дня создания заявки.

`extend-trial` и `extend`: `days` — целое число дней; в `extend` передаётся ровно одно из `days` и `until`, иначе `400`.

`AdminSubscriptionItem`: `id, brandId, brandName, brandDeleted, ownerEmails[], state, isBlocked, plan, billingPeriod, countryCode, timezone, trialEndsAt, paidUntil, accessEndsAt, lastAccessDate, graceEndsAt, daysLeft, suspendedAt, suspendReason, customStaffLimit, customLocationLimit, customCurrency, customMonthlyPrice, customYearlyPrice, limits, usage, overLimit, needsCustomPlan, hasPendingPayment, createdAt`.

Карточка — то же плюс `pricingCountry, currency, trialUserId, graceExtendedUntil, payments[]` (с `adminNote`, `providerData`) и `events[]` (с `actorId`). У `PERIOD_EXTENDED` (подарок дней через `…/extend`) причина лежит в `payload.adminNote`: её видит только админ, владельцу она не отдаётся.

Полезные пресеты фильтров: «Заканчиваются в ближайшие 7 дней» (`state=ACTIVE&state=TRIAL&accessEndsBefore=…`), «Просрочены» (`state=PAST_DUE&state=EXPIRED`), «Нужен тариф Сеть» (`needsCustomPlan=true`), «Превышение» (`overLimit=true`).

`PUT …/plan` с тарифом `CUSTOM` («Сеть»): лимиты и цены задаются полями `custom*`. `convertRemaining: true` пересчитывает оплаченный остаток в дни нового тарифа (как у владельца), `false` оставляет даты как есть.

### 10.4 «Платежи»

| Метод | Путь | Тело / query | Ответ |
| --- | --- | --- | --- |
| GET | `/admin/billing/payments` | `status[]`, `provider[]`, `brandId`, `createdFrom`, `createdTo`, `search` (`KL-000123`, `KL123`, `123`), `orderBy`: `createdAt` / `number` / `paidAt` | страница платежей админа (ниже) |
| POST | `/admin/billing/payments/:id/confirm` | `{ paidAt, method, reference?, adminNote? }` | платёж; кнопка «Оплачено» |
| POST | `/admin/billing/payments/:id/cancel` | `{ adminNote? }` | платёж |

Платёж админа — платёж владельца (6.3) плюс `brandId, brandName, planId, externalId, adminNote, confirmedAt, createdById, confirmedById, providerData`.

`search` ищет только по номеру платежа: текст, который не похож на номер, вернёт пустую страницу. Для поиска по бренду использовать фильтр `brandId` (бренд выбрать в «Подписках»).

Экран по умолчанию — очередь «Ожидают оплаты» (`status=PENDING`). Сумма в заявке зафиксирована: подтверждение не меняет её. В письме админу о новой заявке ссылка ведёт на `/admin/billing/payments?search=KL-000123`.

## 11. Чеклист интеграции

1. `/pricing`: перейти на `GET /public/billing/plans?country=BY` с ISR, `TARIFFS` оставить запасным вариантом.
2. CRM: загрузка `GET /users/me/subscription-states`, баннер в `DashboardShell`, страница блокировки в layout бренда по `isBlocked`.
3. Раздел «Подписка» по claim `billing`: состояние, выбор тарифа, `payment-quote`, заявка, обработка `nextAction`, история.
4. Смена тарифа через `plan-change-quote` → `plan-change`.
5. Обработка `PLAN_STAFF_LIMIT_REACHED` / `PLAN_LOCATION_LIMIT_REACHED` в формах сотрудника и филиала.
6. Публичная запись: `isOnlineBookingAvailable` и `ONLINE_BOOKING_UNAVAILABLE`.
7. Онбординг второго бренда: предупреждение по `trial-eligibility`.
8. Админка: тарифы, цены, настройки, подписки, платежи.
9. Проверить бренд в `FREE` (без подписки, например из сида) — интерфейс выглядит как раньше.
