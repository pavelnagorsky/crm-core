import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';

/** A client's first booking in the brand and the source it came from. */
export interface ClientAcquisition {
  bookingId: string;
  source: TrafficSource | null;
  detail: string | null;
  acquiredAt: Date;
}
