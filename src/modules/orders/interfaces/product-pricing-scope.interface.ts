import { Prisma } from '@prisma/client';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';

/** The visit a product line belongs to: a visit order, or a booking being made or previewed. */
export interface ProductPricingVisit {
  /** Null while the booking is being created or previewed without one. */
  bookingId: string | null;
  /** Visit start; null in a preview without a time (no lead time, price of today). */
  startAt: Date | null;
  /** When the booking was made: the booking period and the lead time count from it. */
  bookedAt: Date;
  channel: PromotionChannel;
  clientId: string | null;
  /** Client by phone when no id is picked (booking window). */
  phone?: string | null;
  promoCode: string | null;
  /** Σ listPrice of the services of the visit. */
  servicesListTotal: Prisma.Decimal;
}

/** A standalone sale. */
export interface ProductPricingSale {
  /** Sale moment: occurredAt of an immediate sale, otherwise now. */
  at: Date;
  clientId: string | null;
  promoCode: string | null;
}

/**
 * Context of the product lines of one order (docs/pricing-stage7-api.md, «Контекст строки»).
 * Exactly one of visit and sale is set.
 */
export interface ProductPricingScope {
  locationId: string;
  brandId: string;
  timezone: string;
  /** The order priced: its own promotion use is not counted. */
  orderId: string | null;
  visit: ProductPricingVisit | null;
  sale: ProductPricingSale | null;
  /** Σ listLineTotal of confirmed product lines of the order. */
  confirmedListTotal: Prisma.Decimal;
}
