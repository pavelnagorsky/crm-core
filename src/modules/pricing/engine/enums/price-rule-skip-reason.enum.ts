/**
 * Why a price rule did not apply to a visit; explain checks them in this order. Promotions
 * use the stage 3 time and target reasons, then their own conditions.
 */
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
  WRONG_CHANNEL = 'WRONG_CHANNEL',
  WRONG_STAFF = 'WRONG_STAFF',
  /** The location "today" is outside bookingFrom - bookingTo. */
  OUT_OF_BOOKING_PERIOD = 'OUT_OF_BOOKING_PERIOD',
  /** Booked later than minLeadMinutes before the visit (or the visit start is unknown). */
  LEAD_TIME_TOO_SHORT = 'LEAD_TIME_TOO_SHORT',
  /** Booked earlier than maxLeadMinutes before the visit (or the visit start is unknown). */
  LEAD_TIME_TOO_LONG = 'LEAD_TIME_TOO_LONG',
  /** For new clients or birthdays, and the client is not known yet. */
  CLIENT_UNKNOWN = 'CLIENT_UNKNOWN',
  NOT_NEW_CLIENT = 'NOT_NEW_CLIENT',
  NO_BIRTH_DATE = 'NO_BIRTH_DATE',
  NOT_BIRTHDAY = 'NOT_BIRTHDAY',
  /** The promotion needs its promo code. */
  PROMO_CODE_REQUIRED = 'PROMO_CODE_REQUIRED',
  /** Visit list total below minVisitTotal (or not known: catalog "from" prices). */
  BELOW_MIN_TOTAL = 'BELOW_MIN_TOTAL',
  LIMIT_REACHED = 'LIMIT_REACHED',
  CLIENT_LIMIT_REACHED = 'CLIENT_LIMIT_REACHED',
  /** Applies, but another discount gives more. */
  LESS_BENEFICIAL = 'LESS_BENEFICIAL',
}
