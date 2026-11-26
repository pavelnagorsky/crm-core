import { Prisma } from '@prisma/client';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../engine/interfaces/line-discount-choice.interface.js';

/**
 * What a visit or a sale priced with discounts needs (docs/pricing-stage4-api.md,
 * docs/pricing-stage7-api.md "Контекст строки").
 */
export interface PricingContextRequest {
  locationId: string;
  brandId: string;
  timezone: string;
  channel: PromotionChannel;
  /**
   * Earliest item start of the visit, UTC; null when the time is not chosen yet, or for a
   * separate sale (lead time conditions then give NO_VISIT on product lines).
   */
  visitStartAt: Date | null;
  /** A brand client picked by id (cabinet), else looked up by phone; neither - unknown. */
  clientId?: string | null;
  phone?: string | null;
  promoCode?: string | null;
  /** By line index; only from the cabinet. */
  choice?: Record<number, LineDiscountChoice>;
  /**
   * The booking being edited, or whose order is priced: its uses (and those of its order) are
   * not counted, and only earlier bookings make a client returning. 404 when it is not a live
   * booking of the location.
   */
  bookingId?: string | null;
  /** The order being priced: its uses (and those of its booking) are not counted. */
  orderId?: string | null;
  /**
   * A separate sale (Order.bookingId = null): the client is new only without live bookings and
   * without other confirmed sales of the brand; limit periods are counted around `now`.
   */
  sale?: boolean;
  /** Inside a transaction that stores prices: the limited promotions are locked and counted fresh. */
  tx?: Prisma.TransactionClient;
  /**
   * With `tx`: false reads the limited promotions in the transaction without locking them
   * (draft product lines, which are no use of a promotion). Defaults to true.
   */
  lockLimits?: boolean;
  /** Defaults to the current time; the sale moment of a sale. */
  now?: Date;
  /**
   * When the visit was booked, for the booking period of promotions (the location "today");
   * defaults to now. A client moving a booking keeps the day it was made.
   */
  bookedAt?: Date;
}
