import { PriceWeekMapDay } from './price-week-map-day.interface.js';

export interface PriceWeekMap {
  /** Whole hours of the grid: earliest shift start and latest shift end of the week. */
  hours: { from: number; to: number };
  days: PriceWeekMapDay[];
}
