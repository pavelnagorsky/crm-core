export const REVIEW_IMPORT_MAX_BYTES = 25 * 1024 * 1024;
export const REVIEW_IMPORT_MAX_ROWS = 50_000;
/** Rows written per transaction. */
export const REVIEW_IMPORT_BATCH_SIZE = 500;
/** Row errors listed in the response; `errorsByCode` still counts all of them. */
export const REVIEW_IMPORT_MAX_LISTED_ERRORS = 100;
/** Distinct unmatched staff names listed in the response. */
export const REVIEW_IMPORT_MAX_LISTED_STAFF_NAMES = 100;

export const REVIEW_IMPORT_SOURCE_MAX_LENGTH = 100;
export const REVIEW_IMPORT_ID_MAX_LENGTH = 128;
export const REVIEW_IMPORT_MIN_YEAR = 2000;
/** Wall-clock hour for a date without time, so the day stays the same in any zone. */
export const REVIEW_IMPORT_DEFAULT_HOUR = 12;
