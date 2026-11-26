import { BookingChannel, Prisma } from '@prisma/client';
import {
  productTargetContext,
  serviceTargetContext,
} from '../engine/compile/rule-target-contexts.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { RoundingCalculator } from '../engine/calculators/rounding.calculator.js';
import { CalendarDayParser } from '../engine/compile/calendar-day.parser.js';
import { CompiledRule } from '../engine/compile/compiled-rule.js';
import { PriceValueType } from '../engine/enums/price-value-type.enum.js';
import { ProductUnit } from '../engine/enums/product-unit.enum.js';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { RoundingMode } from '../engine/enums/rounding-mode.enum.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import { PromotionMatchItem } from '../interfaces/promotion-match-item.interface.js';
import { PromotionMatchTarget } from '../interfaces/promotion-match-target.interface.js';
import { PromotionMatches } from '../interfaces/promotion-matches.interface.js';
import { PromotionSaleLine } from '../interfaces/promotion-sale-line.interface.js';

/** Discount of a promotion on a list price, rounded down like the engine does; minor units. */
export function promotionDiscount(
  entry: Pick<PricingRuleEntry, 'valueType' | 'value'>,
  listPrice: number,
  roundingStep: number,
): number {
  return discountOn(
    entry,
    listPrice,
    listPrice - entry.value,
    roundingStep,
  );
}

/**
 * Discount of a promotion on a product line by the price list, as the engine counts it
 * (docs/pricing-stage7-api.md): on the line total; AMOUNT per piece for counted products,
 * once per line for weighed or measured ones; rounded down; minor units.
 */
export function promotionProductDiscount(
  entry: Pick<PricingRuleEntry, 'valueType' | 'value'>,
  line: Pick<PromotionSaleLine, 'quantity' | 'listUnitPrice' | 'unit'>,
  roundingStep: number,
): number {
  const listLineTotal = MoneyUtils.toMinor(
    MoneyUtils.quantize(line.quantity.mul(line.listUnitPrice)),
  );
  const amount =
    line.unit === ProductUnit.PIECE
      ? MoneyUtils.toMinor(
          MoneyUtils.quantize(
            line.quantity.mul(MoneyUtils.fromMinor(entry.value)),
          ),
        )
      : entry.value;
  return discountOn(entry, listLineTotal, listLineTotal - amount, roundingStep);
}

function discountOn(
  entry: Pick<PricingRuleEntry, 'valueType' | 'value'>,
  listPrice: number,
  amountRaw: number,
  roundingStep: number,
): number {
  const raw =
    entry.valueType === PriceValueType.PERCENT
      ? listPrice - RoundingCalculator.percent(listPrice, entry.value)
      : amountRaw;
  const charged = Math.max(
    0,
    Math.min(
      listPrice,
      RoundingCalculator.round(raw, roundingStep, RoundingMode.DOWN),
    ),
  );
  return listPrice - charged;
}

/** The promotion covers the local date and minute of this moment. */
function coversMoment(rule: CompiledRule, at: Date, timezone: string): boolean {
  const day = CalendarDayParser.parse(TimeUtils.zonedDateStr(at, timezone));
  return rule.timeReason(day, TimeUtils.dateToMinutes(at, timezone)) === null;
}

/**
 * Past items the draft would have reached by schedule (visit start in the location zone),
 * service, channel and staff; client conditions, lead time, promo code and limits are left
 * out (docs/pricing-stage4-api.md, preview matches30d). Separate sales count by the lines
 * the draft reaches by product, sale moment, the ADMIN channel and the seller
 * (docs/pricing-stage7-api.md). The discount is by the list price.
 */
export function promotionMatches(
  draft: PricingRuleEntry,
  items: readonly PromotionMatchItem[],
  targets: ReadonlyMap<string, PromotionMatchTarget>,
  timezone: string,
  roundingStep: number,
  saleLines: readonly PromotionSaleLine[] = [],
): PromotionMatches {
  const promotion = draft.promotion;
  if (!promotion)
    return {
      bookingsCount: 0,
      salesCount: 0,
      discount: new Prisma.Decimal(0),
    };
  const rule = new CompiledRule({ ...draft, enabled: true });
  const staffMatches = (staffId: string | null): boolean =>
    promotion.staffIds.length === 0 ||
    (staffId !== null && promotion.staffIds.includes(staffId));
  const bookings = new Set<string>();
  const sales = new Set<string>();
  let discount = 0;
  for (const item of items) {
    const channel =
      item.channel === BookingChannel.MANUAL
        ? PromotionChannel.ADMIN
        : PromotionChannel.ONLINE;
    if (!promotion.channels.includes(channel)) continue;
    if (!staffMatches(item.staffId)) continue;
    const target = targets.get(item.serviceId);
    if (
      rule.targetReason(
        serviceTargetContext(
          item.serviceId,
          target?.categoryId ?? null,
          item.bundleId,
        ),
      ) !== null
    )
      continue;
    if (!coversMoment(rule, item.visitStartAt, timezone)) continue;
    bookings.add(item.bookingId);
    discount += promotionDiscount(
      draft,
      MoneyUtils.toMinor(item.listPrice),
      roundingStep,
    );
  }
  if (promotion.channels.includes(PromotionChannel.ADMIN))
    for (const line of saleLines) {
      if (!staffMatches(line.sellerStaffId)) continue;
      if (
        rule.targetReason(
          productTargetContext(line.productId, line.productCategoryId),
        ) !== null
      )
        continue;
      if (!coversMoment(rule, line.confirmedAt, timezone)) continue;
      sales.add(line.orderId);
      discount += promotionProductDiscount(draft, line, roundingStep);
    }
  return {
    bookingsCount: bookings.size,
    salesCount: sales.size,
    discount: MoneyUtils.fromMinor(discount),
  };
}
