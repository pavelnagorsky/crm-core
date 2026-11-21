/** The oldest accepted payment date. */
export const PAYMENT_DATE_MAX_PAST_DAYS = 366;

/** Clock skew allowed for a payment date set by hand. */
export const PAYMENT_DATE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Void reason of the records a new payment replaces. */
export const PAYMENT_REPLACEMENT_VOID_REASON = 'Замена оплаты';

/** How long the author may undo a first payment of a visit. */
export const PAYMENT_UNDO_WINDOW_MS = 10 * 60_000;

/** Void reason of an undone payment. */
export const PAYMENT_UNDO_VOID_REASON = 'Отменено сразу после записи';

/**
 * Prefixes of the keys of payments nested in an order operation that has its own key.
 * The parent key is at most 100 characters, so prefixed keys fit the 120-character column.
 */
export const NESTED_PAYMENT_KEY_PREFIX = {
  SALE: 'order-sale:',
  CONFIRM: 'order-confirm:',
  RETURN: 'order-return:',
} as const;
