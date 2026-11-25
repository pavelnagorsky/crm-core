/** Most rows (prices) in one price change. */
export const SERVICE_PRICE_CHANGE_MAX_ITEMS = 10_000;

/** Most scheduled price changes per location. */
export const SERVICE_PRICE_CHANGE_MAX_SCHEDULED = 50;

/** A change can be planned this many days ahead of the location today. */
export const SERVICE_PRICE_CHANGE_MAX_DAYS_AHEAD = 730;

/** Largest page of the price change history. */
export const SERVICE_PRICE_CHANGE_MAX_PAGE_SIZE = 100;

/** The background job runs every 15 minutes. */
export const SERVICE_PRICE_CHANGE_CRON = '0 */15 * * * *';

/** Inclusive bounds of a PERCENT rule in basis points: -99.00% .. 1000.00%. */
export const SERVICE_PRICE_CHANGE_MIN_PERCENT_BP = -9900;
export const SERVICE_PRICE_CHANGE_MAX_PERCENT_BP = 100_000;

/** Interactive transaction timeout of a change that may touch 10 000 rows. */
export const SERVICE_PRICE_CHANGE_TX_TIMEOUT_MS = 60_000;
