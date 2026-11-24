import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';

/** Pricing facts of a hypothetical visit, in the local time of the location (price check). */
export interface LocalPricingContextRequest {
  channel: PromotionChannel;
  /** Visit start, local YYYY-MM-DDTHH:mm:ss. */
  visitStart: string;
  /** Moment of booking, local YYYY-MM-DDTHH:mm:ss; null - now. */
  bookedAt: string | null;
  clientId: string | null;
  promoCode: string | null;
}
