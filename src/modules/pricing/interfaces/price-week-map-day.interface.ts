import { PriceWeekMapSegment } from './price-week-map-segment.interface.js';

export interface PriceWeekMapDay {
  date: string;
  segments: PriceWeekMapSegment[];
}
