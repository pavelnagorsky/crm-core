import { Prisma } from '@prisma/client';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { BookingWithItems } from './booking-with-items.interface.js';

type Item = BookingWithItems['items'][number];

/** How BookingRepricingService prices the items of a booking (docs/pricing-stage5-api.md). */
export interface BookingRepricingRequest {
  /** The items at their final staff and time. */
  items: BookingWithItems['items'];
  channel: PromotionChannel;
  clientId: string | null;
  promoCode: string | null;
  /** The custom price the item will store. */
  customPrice: (item: Item) => Prisma.Decimal | null;
  /**
   * The discount of the item; undefined is AUTO. A choice without fallbackToAuto is a new pick
   * and is stored; a stored one (fallbackToAuto) is reset to AUTO when it no longer applies.
   */
  choice: (item: Item) => LineDiscountChoice | undefined;
  /** Items that get the new layers; the others keep theirs. */
  repriced: (item: Item) => boolean;
  /** true: store promoCode as it is; false: only when its promotion applies. */
  keepPromoCode: boolean;
  /** The total the caller saw: a different one is 409 PRICE_CHANGED. Undefined: no check. */
  expectedTotal?: string;
  /** For the booking period of promotions; defaults to now. */
  bookedAt?: Date;
}
