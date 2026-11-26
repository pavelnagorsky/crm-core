import {
  PriceRuleTargetType,
  PriceValueType,
  PromotionChannel,
  PromotionClientFilter,
  PromotionLimitPeriod,
} from '@prisma/client';

/** What the client-facing conditions of a promotion are written from. Money as "40.00". */
export interface PromotionConditionsInput {
  valueType: PriceValueType;
  value: string;
  /** ISO code of the location currency: "BYN". */
  currency: string;
  appliesToAllServices: boolean;
  appliesToAllProducts: boolean;
  /**
   * Names of the targets (or exclusions) in rule order; a target that is gone has no name.
   * The type tells service-kind targets from products.
   */
  targets: {
    type: PriceRuleTargetType;
    name: string | null;
    excluded: boolean;
  }[];
  /** Bit (isoWeekday - 1); 0 = every day. */
  weekdaysMask: number;
  intervals: { startMinute: number; endMinute: number }[];
  visitFrom: string | null;
  visitTo: string | null;
  bookingFrom: string | null;
  bookingTo: string | null;
  minLeadMinutes: number | null;
  maxLeadMinutes: number | null;
  clientFilter: PromotionClientFilter;
  birthdayWindowDays: number | null;
  staffNames: string[];
  channels: PromotionChannel[];
  minVisitTotal: string | null;
  usageLimitTotal: number | null;
  usageLimitPerClient: number | null;
  usageLimitPeriod: PromotionLimitPeriod | null;
  /** Bookings that used the promotion; null leaves out "Осталось X из N". */
  usageCount: number | null;
}
