/** Largest percent of a surcharge. */
export const PRICE_RULE_MAX_PERCENT = '1000.00';

/** Largest amount of a surcharge: what the Decimal(10,2) column holds. */
export const PRICE_RULE_MAX_AMOUNT = '99999999.99';

export const PRICE_RULE_MAX_HOLIDAY_DATES = 100;

export const PRICE_RULE_MAX_INTERVALS = 20;

export const PRICE_RULE_MAX_TARGETS = 300;

export const PRICE_RULE_NAME_MAX_LENGTH = 100;

export const PRICE_RULE_NOTE_MAX_LENGTH = 500;

/** Appended to the name of a duplicated rule. */
export const PRICE_RULE_COPY_SUFFIX = ' (копия)';

/** Days of the stats window of a rule. */
export const PRICE_RULE_STATS_DAYS = 30;

/** How far ahead the next date of a rule is searched (covers a yearly 29 February). */
export const PRICE_RULE_NEXT_DATE_HORIZON_DAYS = 1500;

/** Largest percent of a promotion. */
export const PROMOTION_MAX_PERCENT = '100.00';

export const PROMOTION_PUBLIC_NAME_MAX_LENGTH = 60;

export const PROMOTION_PUBLIC_DESCRIPTION_MAX_LENGTH = 300;

export const PROMOTION_MAX_BIRTHDAY_WINDOW_DAYS = 30;

/** Largest lead time of a promotion: a year, in minutes. */
export const PROMOTION_MAX_LEAD_MINUTES = 525_600;

/** Largest usage limit of a promotion. */
export const PROMOTION_MAX_USAGE_LIMIT = 1_000_000;

export const PROMOTION_MAX_STAFF = 200;

/** Length of a generated promo code. */
export const PROMO_CODE_LENGTH = 8;

/** Characters of a generated promo code: no 0/O and 1/I, which look alike. */
export const PROMO_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Attempts to find a free generated promo code. */
export const PROMO_CODE_ATTEMPTS = 10;

/** Days after a promotion visit before a client counts as returned or not. */
export const PROMOTION_RETURN_DAYS = 14;

/** Clients listed in "not returned" on the promotion page. */
export const PROMOTION_NOT_RETURNED_LIMIT = 50;

/** Products listed on the promotion page, by revenue. */
export const PROMOTION_REPORT_PRODUCT_LIMIT = 20;

/** Product examples in a promotion preview. */
export const PROMOTION_PRODUCT_EXAMPLE_LIMIT = 5;
