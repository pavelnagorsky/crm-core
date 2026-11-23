import { PriceWeekMapAdjustment } from './price-week-map-adjustment.interface.js';

/** Part of a day with one price. Minutes of the local day, end exclusive (up to 1440). */
export interface PriceWeekMapSegment {
  start: number;
  end: number;
  price: number;
  staffPrice: number;
  adjustments: PriceWeekMapAdjustment[];
}
