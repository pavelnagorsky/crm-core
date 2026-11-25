import { BookingPriceChange } from './booking-price-change.interface.js';

export interface BookingStatusChangeDetails {
  cancellationReason?: string | null;
  /** For a move: the start before it. */
  previousStartAt?: Date | null;
  /** For a move that changed the services total (docs/pricing-stage5-api.md). */
  priceChange?: BookingPriceChange | null;
  /** Absent once there is nothing left to manage, e.g. after a cancellation. */
  manageLink?: string | null;
}
