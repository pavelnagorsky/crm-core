import { PromotionClientFilter } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { NormalizedPriceRule } from '../interfaces/normalized-price-rule.interface.js';

const day = (date: string | null): Date | null =>
  date === null ? null : TimeUtils.dateOnly(date);

/**
 * Promotion columns of a validated rule as stored; a surcharge gets the empty values the
 * database checks require.
 */
export function promotionColumns(rule: NormalizedPriceRule) {
  const promotion = rule.promotion;
  return {
    scenario: promotion?.scenario ?? null,
    publicName: promotion?.publicName ?? null,
    publicDescription: promotion?.publicDescription ?? null,
    showAsPromotion: promotion?.showAsPromotion ?? true,
    bookingFrom: day(promotion?.bookingFrom ?? null),
    bookingTo: day(promotion?.bookingTo ?? null),
    minLeadMinutes: promotion?.minLeadMinutes ?? null,
    maxLeadMinutes: promotion?.maxLeadMinutes ?? null,
    channels: promotion?.channels ?? [],
    clientFilter: promotion?.clientFilter ?? PromotionClientFilter.ANY,
    birthdayWindowDays: promotion?.birthdayWindowDays ?? null,
    promoCode: promotion?.promoCode ?? null,
    usageLimitTotal: promotion?.usageLimitTotal ?? null,
    usageLimitPerClient: promotion?.usageLimitPerClient ?? null,
    usageLimitPeriod: promotion?.usageLimitPeriod ?? null,
    minVisitTotal: promotion?.minVisitTotal ?? null,
  };
}
