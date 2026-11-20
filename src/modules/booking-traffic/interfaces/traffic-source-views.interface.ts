import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';

/** Views and form opens of a location's booking pages and widgets from one source over a period. */
export interface TrafficSourceViews {
  source: TrafficSource;
  views: number;
  formOpens: number;
}
