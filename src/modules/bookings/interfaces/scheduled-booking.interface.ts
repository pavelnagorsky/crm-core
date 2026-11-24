import { PromoCodeResult } from '../../pricing/engine/interfaces/promo-code-result.interface.js';
import { ServiceLinePrice } from '../../pricing/interfaces/service-line-price.interface.js';
import { ResolvedBookingItem } from './resolved-booking-item.interface.js';

/** Items with the staff assigned and priced, and what the promo code did. */
export interface ScheduledBooking {
  items: ResolvedBookingItem[];
  /** The quote of each item, in item order (discount options for the booking dialog). */
  prices: ServiceLinePrice[];
  promoCode: PromoCodeResult | null;
}
