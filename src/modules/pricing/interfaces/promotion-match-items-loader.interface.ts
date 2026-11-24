import { PromotionMatchItem } from './promotion-match-item.interface.js';

/** Past booking items of the location with a visit start in [from, to] (the bookings module reads them). */
export type PromotionMatchItemsLoader = (
  from: Date,
  to: Date,
) => Promise<PromotionMatchItem[]>;
