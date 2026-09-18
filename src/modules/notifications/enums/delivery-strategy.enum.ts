export enum DeliveryStrategy {
  /** Send to ALL available channels. Used when every channel must receive the notification (e.g. critical alerts). */
  ALL = 'ALL',

  /** Try channels in order; stop after the first successful delivery. Used when one delivery is enough but a fallback is desirable (e.g. email → SMS). */
  FIRST_AVAILABLE = 'FIRST_AVAILABLE',

  /** Send to all declared channels and log failures, but never throw. Used when delivery is desired but not critical. */
  BEST_EFFORT = 'BEST_EFFORT',

  /** Try channels in order; throw if all fail. Used when delivery failure must propagate to the caller (e.g. registration email). */
  REQUIRED = 'REQUIRED',
}
