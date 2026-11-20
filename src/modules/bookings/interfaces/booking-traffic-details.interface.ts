import { BookingTrafficTouch } from '@prisma/client';

/** Traffic evidence shown on the booking card. */
export interface BookingTrafficDetails {
  /** Stored touch of an online booking; null for a direct visit and for manual bookings. */
  touch: BookingTrafficTouch | null;
  /** The booking is its client's first one in the brand. */
  isClientAcquisition: boolean;
}
