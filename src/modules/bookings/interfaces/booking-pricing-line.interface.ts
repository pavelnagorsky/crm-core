import { PromotionSkip } from '../../pricing/engine/interfaces/promotion-skip.interface.js';
import { ServiceDiscountOption } from '../../pricing/interfaces/service-discount-option.interface.js';
import { ServicePriceAdjustment } from '../../pricing/interfaces/service-price-adjustment.interface.js';
import { OrderPricingLine } from '../../orders/interfaces/order-pricing-line.interface.js';

/** A priced line of the booking preview; products have no discount options. */
export interface BookingPricingLine extends OrderPricingLine {
  discount: ServicePriceAdjustment | null;
  /** Cabinet only: discounts that apply, best first. */
  eligible: ServiceDiscountOption[];
  /** Cabinet only: promotions on the service that do not apply. */
  ineligible: PromotionSkip[];
}
