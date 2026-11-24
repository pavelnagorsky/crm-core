import { PromotionChannel } from '../enums/promotion-channel.enum.js';
import { PromotionClientFilter } from '../enums/promotion-client-filter.enum.js';
import { PromotionLimitPeriod } from '../enums/promotion-limit-period.enum.js';

/**
 * Conditions of a promotion (docs/pricing-stage4-api.md). The schedule (visit period,
 * weekdays, intervals) and targets live on the rule entry. Money in minor units.
 */
export interface PricingPromotionEntry {
  publicName: string;
  /** False: clients see a lower price, without a label or the old price. */
  showAsPromotion: boolean;
  /** Booking period: the location "today", YYYY-MM-DD. */
  bookingFrom: string | null;
  bookingTo: string | null;
  /** Visit start - pricing moment must be at least this (book in advance). */
  minLeadMinutes: number | null;
  /** Visit start - pricing moment must be at most this (last-minute). */
  maxLeadMinutes: number | null;
  /** Not empty. */
  channels: PromotionChannel[];
  /** Empty = every staff member. */
  staffIds: string[];
  clientFilter: PromotionClientFilter;
  /** BIRTHDAY only: visit within +-N days of the birthday. */
  birthdayWindowDays: number | null;
  /** Upper case; null = no code needed. */
  promoCode: string | null;
  usageLimitTotal: number | null;
  usageLimitPerClient: number | null;
  /** Window of usageLimitPerClient; the caller counts usage with it. */
  usageLimitPeriod: PromotionLimitPeriod | null;
  /** Visit list total (sum of line list prices) must be at least this. */
  minVisitTotal: number | null;
}
