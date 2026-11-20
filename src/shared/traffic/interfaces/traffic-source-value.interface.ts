import { TrafficSource } from '../enums/traffic-source.enum.js';

/** A source with its optional detail, as stored on a booking or a client. */
export interface TrafficSourceValue {
  source: TrafficSource | null;
  detail: string | null;
}
