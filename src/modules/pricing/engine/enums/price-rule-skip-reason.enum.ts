/** Why a surcharge rule did not apply to a visit; explain checks them in this order. */
export enum PriceRuleSkipReason {
  DISABLED = 'DISABLED',
  OUT_OF_PERIOD = 'OUT_OF_PERIOD',
  WRONG_WEEKDAY = 'WRONG_WEEKDAY',
  OUT_OF_INTERVAL = 'OUT_OF_INTERVAL',
  NOT_HOLIDAY_DATE = 'NOT_HOLIDAY_DATE',
  NOT_TARGETED = 'NOT_TARGETED',
  EXCLUDED = 'EXCLUDED',
  /** Matched, but an exclusive holiday surcharge applies on this date instead. */
  OVERRIDDEN_BY_HOLIDAY = 'OVERRIDDEN_BY_HOLIDAY',
}
