import { BookingCreationResult } from './booking-creation-result.interface.js';
import { BookingWithItems } from './booking-with-items.interface.js';

export type BookingCreationOutcome =
  | (BookingCreationResult & { created: true })
  | { booking: BookingWithItems; created: false };
