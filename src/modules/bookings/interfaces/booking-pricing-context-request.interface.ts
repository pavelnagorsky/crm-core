import { Prisma } from '@prisma/client';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';

/** What a visit priced with discounts needs from the booking (docs/pricing-stage4-api.md). */
export interface BookingPricingContextRequest {
  locationId: string;
  brandId: string;
  timezone: string;
  channel: PromotionChannel;
  /** Earliest item start, UTC; null when the time is not chosen yet. */
  visitStartAt: Date | null;
  /** A brand client picked by id (cabinet), else looked up by phone; neither - unknown. */
  clientId?: string | null;
  phone?: string | null;
  promoCode?: string | null;
  /** By line index; only from the cabinet. */
  choice?: Record<number, LineDiscountChoice>;
  /** The booking being edited: not counted as a use, and only earlier bookings make a client returning. */
  bookingId?: string | null;
  /** Inside the creation transaction: the limited promotions are locked and counted fresh. */
  tx?: Prisma.TransactionClient;
  /** Defaults to the current time. */
  now?: Date;
}
