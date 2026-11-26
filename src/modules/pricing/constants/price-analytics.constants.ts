import { PriceChangeReason } from '../enums/price-change-reason.enum.js';

/** `staffId` filter value for items without a staff member or seller. */
export const PRICE_ANALYTICS_NO_STAFF = 'none';

/** Most rows of the items export; more is 400 PRICE_ANALYTICS_EXPORT_TOO_LARGE. */
export const PRICE_ANALYTICS_EXPORT_LIMIT = 50_000;

/**
 * Candidate rows (the SQL pre-filter, before returns and reasons are computed) over which the
 * export is refused without loading: twice the limit, so rows that drop out do not reject an
 * export that would fit. The exact check on the computed items stays.
 */
export const PRICE_ANALYTICS_EXPORT_CANDIDATES_LIMIT =
  PRICE_ANALYTICS_EXPORT_LIMIT * 2;

/** Most items of one page of the items list. */
export const PRICE_ANALYTICS_MAX_PAGE_SIZE = 100;

/** Reasons that reduce the price (the "discounts" group). */
export const PRICE_ANALYTICS_DISCOUNT_REASONS: ReadonlySet<PriceChangeReason> =
  new Set([
    PriceChangeReason.PROMOTION,
    PriceChangeReason.CLIENT_DISCOUNT,
    PriceChangeReason.CUSTOM_PRICE_DOWN,
  ]);

/** Reasons that come from a price rule and carry its id. */
export const PRICE_ANALYTICS_RULE_REASONS: ReadonlySet<PriceChangeReason> =
  new Set([PriceChangeReason.PROMOTION, PriceChangeReason.SURCHARGE]);

/** Labels of the reasons without a rule: the order of summary rows with equal amounts (their name is null). */
export const PRICE_ANALYTICS_REASON_NAMES: Record<
  | PriceChangeReason.CLIENT_DISCOUNT
  | PriceChangeReason.CUSTOM_PRICE_DOWN
  | PriceChangeReason.CUSTOM_PRICE_UP,
  string
> = {
  [PriceChangeReason.CLIENT_DISCOUNT]: 'Скидка клиента',
  [PriceChangeReason.CUSTOM_PRICE_DOWN]: 'Своя цена ниже прайса',
  [PriceChangeReason.CUSTOM_PRICE_UP]: 'Своя цена выше прайса',
};

/** Name of the custom price change of one item. */
export const PRICE_ANALYTICS_CUSTOM_PRICE_NAME = 'Своя цена';

export const PRICE_ANALYTICS_SHEET = 'Позиции';

/** The export is `${PRICE_ANALYTICS_FILE}-<from>-<to>.xlsx`. */
export const PRICE_ANALYTICS_FILE = 'skidki-i-natsenki';

/** Column headers of the items export. */
export const PRICE_ANALYTICS_COLUMNS = {
  date: 'Дата',
  time: 'Время',
  source: 'Запись или продажа',
  client: 'Клиент',
  staff: 'Мастер или продавец',
  title: 'Позиция',
  itemType: 'Тип',
  quantity: 'Количество',
  regular: 'Обычная цена',
  surcharges: 'Наценки',
  discounts: 'Скидки',
  received: 'Итог',
  changes: 'Что изменило цену',
} as const;

export const PRICE_ANALYTICS_SOURCE_LABELS = {
  BOOKING: 'Запись',
  SALE: 'Продажа',
} as const;

export const PRICE_ANALYTICS_ITEM_TYPE_LABELS = {
  SERVICE: 'Услуга',
  PRODUCT: 'Товар',
} as const;

export const PRICE_ANALYTICS_TOTAL_LABEL = 'Итого';

/** Separator of the changes of one item in the export. */
export const PRICE_ANALYTICS_CHANGES_SEPARATOR = '; ';
