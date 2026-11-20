/** Longest stored traffic source detail ("Уточнение"). */
export const TRAFFIC_DETAIL_MAX_LENGTH = 64;
export const UTM_SOURCE_MAX_LENGTH = 100;
export const UTM_MEDIUM_MAX_LENGTH = 100;
export const UTM_CAMPAIGN_MAX_LENGTH = 150;
export const UTM_CONTENT_MAX_LENGTH = 150;
export const UTM_TERM_MAX_LENGTH = 150;
export const REFERRER_HOST_MAX_LENGTH = 253;
/** Longer raw referrer input is cut to this before the host is parsed out of it. */
export const REFERRER_INPUT_MAX_LENGTH = 2048;
export const CLICK_ID_MAX_LENGTH = 255;
/** The client keeps a touch for 30 days; a day more covers clock skew. */
export const TOUCH_MAX_AGE_MS = 31 * 24 * 60 * 60 * 1000;
export const TOUCH_MAX_FUTURE_MS = 5 * 60 * 1000;
/** Click ids identify a visitor at the ad platform; they are dropped after this many days. */
export const CLICK_ID_RETENTION_DAYS = 90;
/** Hourly view and form open counters by source are kept for this many months. */
export const TRAFFIC_STAT_RETENTION_MONTHS = 25;
