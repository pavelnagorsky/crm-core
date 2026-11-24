import { BookingChannel, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { RoundingCalculator } from '../engine/calculators/rounding.calculator.js';
import { CalendarDayParser } from '../engine/compile/calendar-day.parser.js';
import { CompiledRule } from '../engine/compile/compiled-rule.js';
import { PriceValueType } from '../engine/enums/price-value-type.enum.js';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { RoundingMode } from '../engine/enums/rounding-mode.enum.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import { PromotionMatchItem } from '../interfaces/promotion-match-item.interface.js';
import { PromotionMatchTarget } from '../interfaces/promotion-match-target.interface.js';
import { PromotionMatches } from '../interfaces/promotion-matches.interface.js';

/** Discount of a promotion on a list price, rounded down like the engine does; minor units. */
export function promotionDiscount(
  entry: Pick<PricingRuleEntry, 'valueType' | 'value'>,
  listPrice: number,
  roundingStep: number,
): number {
  const raw =
    entry.valueType === PriceValueType.PERCENT
      ? listPrice - RoundingCalculator.percent(listPrice, entry.value)
      : listPrice - entry.value;
  const charged = Math.min(
    listPrice,
    RoundingCalculator.round(raw, roundingStep, RoundingMode.DOWN),
  );
  return listPrice - charged;
}

/**
 * Past items the draft would have reached by schedule (visit start in the location zone),
 * service, channel and staff; client conditions, lead time, promo code and limits are left
 * out (docs/pricing-stage4-api.md, preview matches30d). The discount is by the list price.
 */
export function promotionMatches(
  draft: PricingRuleEntry,
  items: readonly PromotionMatchItem[],
  targets: ReadonlyMap<string, PromotionMatchTarget>,
  timezone: string,
  roundingStep: number,
): PromotionMatches {
  const promotion = draft.promotion;
  if (!promotion) return { bookingsCount: 0, discount: new Prisma.Decimal(0) };
  const rule = new CompiledRule({ ...draft, enabled: true });
  const bookings = new Set<string>();
  let discount = 0;
  for (const item of items) {
    const channel =
      item.channel === BookingChannel.MANUAL
        ? PromotionChannel.ADMIN
        : PromotionChannel.ONLINE;
    if (!promotion.channels.includes(channel)) continue;
    if (
      promotion.staffIds.length > 0 &&
      !promotion.staffIds.includes(item.staffId)
    )
      continue;
    const target = targets.get(item.serviceId);
    if (
      rule.targetReason({
        serviceId: item.serviceId,
        categoryId: target?.categoryId ?? null,
        bundleId: item.bundleId,
      }) !== null
    )
      continue;
    const day = CalendarDayParser.parse(
      TimeUtils.zonedDateStr(item.visitStartAt, timezone),
    );
    if (
      rule.timeReason(day, TimeUtils.dateToMinutes(item.visitStartAt, timezone)) !==
      null
    )
      continue;
    bookings.add(item.bookingId);
    discount += promotionDiscount(
      draft,
      MoneyUtils.toMinor(item.listPrice),
      roundingStep,
    );
  }
  return {
    bookingsCount: bookings.size,
    discount: MoneyUtils.fromMinor(discount),
  };
}
