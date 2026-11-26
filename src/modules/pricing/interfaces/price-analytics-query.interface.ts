import { PriceChangeReason } from '../enums/price-change-reason.enum.js';

/** Which items of a location the bookings and orders modules load for the report. */
export interface PriceAnalyticsQuery {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
  /** Visits that start later are left out. */
  now: Date;
  /** undefined: any staff member; null: items without one. */
  staffId?: string | null;
  /**
   * Only items that can have a reason (a custom price or a rule layer). An SQL pre-filter:
   * the caller still drops items whose computed changes are empty.
   */
  changedOnly: boolean;
  /** Pre-filter by the reason (and rule) the caller filters by. */
  reason?: PriceChangeReason;
  ruleId?: string;
}
