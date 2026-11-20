import { TrafficSource } from '../../../shared/traffic/enums/traffic-source.enum.js';
import { TrafficTouchRecord } from '../../../shared/traffic/interfaces/traffic-touch-record.interface.js';

/** Marketing source of a new booking: classified for an online one, picked by staff for a manual one. */
export interface BookingTraffic {
  source: TrafficSource | null;
  detail: string | null;
  /** Evidence of an online visit; null for a direct visit and for manual bookings. */
  touch: TrafficTouchRecord | null;
}
