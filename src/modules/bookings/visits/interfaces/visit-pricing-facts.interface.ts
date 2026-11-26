import { Prisma } from '@prisma/client';
import { PromotionChannel } from '../../../pricing/engine/enums/promotion-channel.enum.js';

/**
 * What prices the products of a visit order: the booking context of its product lines
 * (docs/pricing-stage7-api.md, «Контекст строки»).
 */
export interface VisitPricingFacts {
  bookingId: string;
  /** Visit start: the date and minute of promotion schedules and of the product price. */
  startAt: Date;
  /** When the booking was made: the booking period and the lead time count from it. */
  createdAt: Date;
  channel: PromotionChannel;
  clientId: string | null;
  promoCode: string | null;
  /** Σ listPrice of the booking items: the visit total of minVisitTotal. */
  servicesListTotal: Prisma.Decimal;
}
