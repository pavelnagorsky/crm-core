import {
  PromotionChannel,
  PromotionClientFilter,
  PromotionLimitPeriod,
  PromotionScenario,
} from '@prisma/client';

/** Validated promotion fields in stored form; dates are YYYY-MM-DD, money two-digit strings. */
export interface NormalizedPromotion {
  scenario: PromotionScenario | null;
  publicName: string | null;
  publicDescription: string | null;
  showAsPromotion: boolean;
  bookingFrom: string | null;
  bookingTo: string | null;
  minLeadMinutes: number | null;
  maxLeadMinutes: number | null;
  /** Not empty, in enum order. */
  channels: PromotionChannel[];
  /** Distinct, sorted. */
  staffIds: string[];
  clientFilter: PromotionClientFilter;
  birthdayWindowDays: number | null;
  /** Upper case. */
  promoCode: string | null;
  usageLimitTotal: number | null;
  usageLimitPerClient: number | null;
  usageLimitPeriod: PromotionLimitPeriod | null;
  minVisitTotal: string | null;
}
