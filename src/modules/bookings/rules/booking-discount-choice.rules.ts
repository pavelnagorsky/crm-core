import {
  BookingChannel,
  DiscountChoiceMode as PrismaDiscountChoiceMode,
} from '@prisma/client';
import { DiscountChoiceMode } from '../../pricing/engine/enums/discount-choice-mode.enum.js';
import { PriceAdjustmentKind } from '../../pricing/engine/enums/price-adjustment-kind.enum.js';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { ServiceLinePrice } from '../../pricing/interfaces/service-line-price.interface.js';
import { BookingItemDiscountChoice } from '../interfaces/booking-item-discount-choice.interface.js';

const AUTO: BookingItemDiscountChoice = {
  discountChoice: null,
  discountChoiceRuleId: null,
};

/** The promotion channel of a booking: staff book as ADMIN, the booking page and widget ONLINE. */
export function promotionChannelOf(channel: BookingChannel): PromotionChannel {
  return channel === BookingChannel.MANUAL
    ? PromotionChannel.ADMIN
    : PromotionChannel.ONLINE;
}

/** Columns of a picked discount; AUTO (or none) is stored as null. */
export function storedDiscountChoice(
  choice: LineDiscountChoice | undefined,
): BookingItemDiscountChoice {
  if (!choice || choice.mode === DiscountChoiceMode.AUTO) return AUTO;
  return {
    discountChoice: choice.mode as PrismaDiscountChoiceMode,
    discountChoiceRuleId:
      choice.mode === DiscountChoiceMode.RULE ? (choice.ruleId ?? null) : null,
  };
}

/**
 * The stored choice of an item applied again (docs/pricing-stage5-api.md): a discount that
 * no longer applies gives the best one; undefined is AUTO. A RULE whose rule is gone is AUTO.
 */
export function repeatedDiscountChoice(
  item: BookingItemDiscountChoice,
): LineDiscountChoice | undefined {
  if (!item.discountChoice) return undefined;
  const mode = item.discountChoice as DiscountChoiceMode;
  if (mode === DiscountChoiceMode.AUTO) return undefined;
  if (mode === DiscountChoiceMode.RULE && item.discountChoiceRuleId === null)
    return undefined;
  return {
    mode,
    ruleId: mode === DiscountChoiceMode.RULE ? item.discountChoiceRuleId : null,
    fallbackToAuto: true,
  };
}

/**
 * Whether a stored choice survived its repricing: NONE always does; RULE and CLIENT_DISCOUNT
 * when the line got that discount. A line with a custom price has no discounts to compare,
 * so its choice stays.
 */
export function discountChoiceHeld(
  choice: LineDiscountChoice,
  line: Pick<ServiceLinePrice, 'customPrice' | 'discount'>,
): boolean {
  if (line.customPrice !== null) return true;
  switch (choice.mode) {
    case DiscountChoiceMode.RULE:
      return (
        (line.discount?.kind as string | undefined) ===
          PriceAdjustmentKind.PROMOTION &&
        line.discount?.ruleId === choice.ruleId
      );
    case DiscountChoiceMode.CLIENT_DISCOUNT:
      return (
        (line.discount?.kind as string | undefined) ===
        PriceAdjustmentKind.CLIENT_DISCOUNT
      );
    default:
      return true;
  }
}
